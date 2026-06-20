import "dotenv/config"; // load .env here so keys propagate to the spawned server
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Buyer-agent simulator.
 *
 * Plays the role of an AI agent that wants to BUY/USE scraped data. It talks to
 * ContextWall over the REAL MCP protocol (spawns src/index.ts as a subprocess,
 * lists its tools, and calls `scrape_validated`). For each goal it hands over an
 * INTENT + a desired FORMAT (required fields), then decides:
 *
 *   ✅ clean data returned  → "worth it — ingest / pay for it"
 *   🛑 circuit broken       → "do NOT buy — here's exactly why" (context protected)
 *
 * Run:  npm run agent           (all three scenarios)
 *       npm run agent hard      (just one)
 */

const c = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  red: "\x1b[31m", green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m",
};

type Fixture = "clean" | "hard" | "soft";

interface Goal {
  fixture: Fixture;
  intent: string;
  format: string[]; // the shape the agent needs every row to have
}

const GOALS: Record<Fixture, Goal> = {
  clean: { fixture: "clean", intent: "Italian restaurants with delivery", format: ["name", "delivery", "cuisine"] },
  hard: { fixture: "hard", intent: "Italian restaurants with delivery", format: ["name", "delivery", "cuisine"] },
  soft: { fixture: "soft", intent: "Italian restaurants with delivery", format: ["name", "delivery", "cuisine"] },
};

async function main() {
  const which = process.argv[2] as Fixture | undefined;
  const goals = which ? [GOALS[which]] : [GOALS.clean, GOALS.hard, GOALS.soft];

  // Spawn the ContextWall MCP server over stdio — exactly how a real agent client would.
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/index.ts"],
    env: cleanEnv(),
  });
  const client = new Client({ name: "buyer-agent-sim", version: "1.0.0" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  const tool = tools.find((t) => t.name === "scrape_validated");
  console.log(`\n${c.cyan}${c.bold}🤖 Buyer agent connected to ContextWall MCP.${c.reset}`);
  console.log(`${c.dim}   Discovered tool: ${tool?.name} — the agent must provide an intent + format.${c.reset}\n`);

  for (const g of goals) {
    await runGoal(client, g);
  }

  await client.close();
}

async function runGoal(client: Client, goal: Goal) {
  console.log(`${c.bold}────────────────────────────────────────────────────────${c.reset}`);
  console.log(`${c.bold}🤖 Agent goal:${c.reset} "${goal.intent}"  ${c.dim}[scenario: ${goal.fixture}]${c.reset}`);
  console.log(`${c.dim}   Requesting data via MCP → scrape_validated(intent, format=${JSON.stringify(goal.format)})${c.reset}`);

  const res: any = await client.callTool({
    name: "scrape_validated",
    arguments: {
      intent: goal.intent,
      requiredFields: goal.format,
      mockFixture: goal.fixture,
    },
  });

  const firstText: string = res.content?.[0]?.text ?? "";

  if (res.isError) {
    // ContextWall refused the data and told the agent why.
    console.log(`\n${c.red}   ◀ ContextWall response:${c.reset}`);
    console.log(indent(firstText, c.red));
    console.log(`\n${c.yellow}${c.bold}   🛑 Agent decision: DO NOT BUY / DO NOT INGEST.${c.reset}`);
    console.log(`${c.dim}      The data never enters my context window — no hallucination risk,${c.reset}`);
    console.log(`${c.dim}      no tokens wasted reading garbage, and I won't re-pay for a bad source.${c.reset}\n`);
    return;
  }

  // Success: parse the summary + the data payload.
  const summary = safeJson(firstText.split("\n").slice(1).join("\n"));
  const data = safeJson(res.content?.[1]?.text ?? "[]") ?? [];
  console.log(`\n${c.green}   ◀ ContextWall returned ${Array.isArray(data) ? data.length : 0} validated rows.${c.reset}`);
  if (Array.isArray(data) && data[0]) {
    console.log(`${c.dim}      e.g. ${JSON.stringify(data[0])}${c.reset}`);
  }
  console.log(`\n${c.green}${c.bold}   ✅ Agent decision: BUY / INGEST — the data is clean and on-intent.${c.reset}`);
  if (summary?.stats) {
    console.log(`${c.dim}      (verdict: passed both tiers)${c.reset}`);
  }
  console.log("");
}

function indent(s: string, color: string) {
  return s.split("\n").map((l) => `${color}      ${l}${c.reset}`).join("\n");
}
function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}
function cleanEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => typeof v === "string"),
  ) as Record<string, string>;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
