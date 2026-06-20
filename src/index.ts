#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "./config.js";
import { runFirewall } from "./firewall/index.js";
import { ApifyScraper } from "./providers/apify.js";
import type { Scraper } from "./providers/scraper.js";
import { MockScraper } from "./mock/mockActor.js";
import type { FixtureKey } from "./mock/fixtures.js";

/**
 * ContextWall MCP server (Gateway Proxy pattern).
 *
 * Exposes ONE tool — `scrape_validated` — that the buyer agent calls instead
 * of the raw Apify tool. Internally it streams the upstream scrape through the
 * two-tier firewall and returns either clean data or a circuit-break error.
 * The agent's context never sees the toxic payload.
 */

function pickScraper(): Scraper {
  if (config.scraper === "apify" && config.apify.token) return new ApifyScraper();
  // default / fallback: mock so the server is always demoable
  return new MockScraper("hard");
}

const server = new McpServer({ name: "context-wall", version: "0.1.0" });

server.registerTool(
  "scrape_validated",
  {
    title: "Scrape (firewalled)",
    description:
      "Run a web scrape through the ContextWall data firewall. Returns clean, " +
      "intent-aligned data, or trips a circuit breaker (and aborts the upstream " +
      "job) when the result is a block page or semantically wrong. Use this " +
      "instead of calling a raw scraper tool. If it returns an error/circuit-broken " +
      "result, do NOT silently retry the same request — the source is blocked or the " +
      "data does not match the intent. Read the reason, report it to the user, and " +
      "only retry with a changed intent/source or after the user confirms.",
    inputSchema: {
      intent: z.string().describe("The natural-language goal of this scrape, e.g. 'Italian restaurants with delivery'."),
      url: z.string().url().optional().describe("Target URL (for live Apify mode)."),
      actor: z.string().optional().describe("Apify actor id to run; defaults to env."),
      requiredFields: z.array(z.string()).optional().describe("Field names every row must have."),
      mockFixture: z.enum(["clean", "hard", "soft"]).optional().describe("Force a demo fixture (mock mode)."),
    },
  },
  async ({ intent, url, actor, requiredFields, mockFixture }) => {
    const scraper: Scraper =
      mockFixture || config.scraper === "mock"
        ? new MockScraper((mockFixture ?? "hard") as FixtureKey)
        : pickScraper();

    const result = await runFirewall(scraper, {
      intent,
      actor,
      query: url ? { startUrls: [{ url }] } : {},
      tier1: { requiredFields },
    });

    const summary = {
      verdict: result.verdict,
      stats: result.stats,
      itemCount: result.data.length,
    };

    if (!result.verdict.ok) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text:
              `⛔ ContextWall circuit broken (${result.verdict.tier}/${result.verdict.reason}).\n` +
              `${result.verdict.detail}\n` +
              `Upstream ${result.stats.aborted ? "aborted" : "completed"}. ` +
              `~${result.stats.tokensBlocked} toxic tokens blocked (~$${result.stats.usdSaved.toFixed(4)} saved).\n` +
              `No data returned — do not retry blindly; the source is protected/mismatched.`,
          },
        ],
      };
    }

    return {
      content: [
        { type: "text" as const, text: `✔ ${result.data.length} validated items.\n${JSON.stringify(summary)}` },
        { type: "text" as const, text: JSON.stringify(result.data) },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[context-wall] MCP server ready on stdio");
