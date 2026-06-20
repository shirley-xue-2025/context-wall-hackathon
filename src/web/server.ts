import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { runFirewall, type FirewallEvent } from "../firewall/index.js";
import { ApifyScraper } from "../providers/apify.js";
import { MockScraper } from "../mock/mockActor.js";
import { FIXTURES, type FixtureKey } from "../mock/fixtures.js";
import { judgeSemantic } from "../providers/llm.js";
import { hasLlm } from "../config.js";

/**
 * Tiny dependency-free dashboard server.
 *   GET /                → the dashboard page
 *   GET /api/run?...     → Server-Sent Events stream of a firewall run
 *
 * Run with:  npm run dashboard   then open http://localhost:4000
 */

const PORT = Number(process.env.CW_PORT ?? 4000);
const HTML_PATH = fileURLToPath(new URL("./public/index.html", import.meta.url));

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (url.pathname === "/") {
    const html = await readFile(HTML_PATH, "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (url.pathname === "/api/run") {
    await handleRun(url, res);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

async function handleRun(url: URL, res: import("node:http").ServerResponse) {
  const fixture = (url.searchParams.get("fixture") ?? "hard") as FixtureKey;
  const requestedMode = url.searchParams.get("mode") ?? "mock";
  const rows = Number(url.searchParams.get("rows") ?? 12);
  const live = requestedMode === "live" && Boolean(config.apify.token);
  const intent = FIXTURES[fixture]?.intent ?? "Italian restaurants with delivery";

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event: string, data: unknown) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  send("meta", { fixture, intent, total: rows, mode: live ? "live" : "mock", llm: Boolean(config.gemini.apiKey) });

  // Mock stream is paced so the (real) Gemini judge can return and trip the
  // breaker mid-stream on the soft case, mirroring live behaviour.
  // Tier 1 (hard) trips at row 1 → fast pace is fine. Tier 2 (soft) waits on a
  // ~7s free-tier LLM round-trip, so pace it slower to abort partway through.
  const mockDelay = fixture === "soft" ? 1000 : 280;
  const scraper = live ? new ApifyScraper() : new MockScraper(fixture, { delayMs: mockDelay });

  try {
    await runFirewall(scraper, {
      intent,
      actor: live ? config.apify.defaultActor : undefined,
      query: { fixture, rowCount: rows, delayMs: live ? 1000 : 280 },
      tier1: { requiredFields: ["name"] },
      sampleSize: 3,
      onEvent: (e: FirewallEvent) => send(e.type, e),
    });
  } catch (err) {
    send("error", { message: String(err) });
  }
  send("end", {});
  res.end();
}

server.listen(PORT, () => {
  console.log(`\n  ContextWall dashboard → http://localhost:${PORT}`);
  console.log(`  Apify token: ${config.apify.token ? "set (live mode available)" : "missing (mock only)"}`);
  console.log(`  Gemini key:  ${config.gemini.apiKey ? "set (real judge)" : "missing (heuristic judge)"}\n`);
  // Warm up the judge so the first demo click gets a fast (cached) response
  // instead of the slow cold-start call. Fire-and-forget; ignore errors.
  if (hasLlm()) {
    judgeSemantic("warmup", [{ ping: "pong" }])
      .then(() => console.log("  (judge warmed up)\n"))
      .catch(() => {});
  }
});
