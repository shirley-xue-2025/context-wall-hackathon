import { config } from "../config.js";
import { runFirewall } from "../firewall/index.js";
import { ApifyScraper } from "../providers/apify.js";
import type { FixtureKey } from "../mock/fixtures.js";
import { renderHeader, renderResult } from "./dashboard.js";

/**
 * LIVE demo: drives the real Apify mock actor through the firewall.
 *   npm run demo:live          → hard fixture (Cloudflare)
 *   npm run demo:live soft     → semantic mismatch
 *   npm run demo:live clean    → genuine data
 *
 * Requires APIFY_TOKEN in .env. Watch the run get ABORTED in the Apify console.
 */
const INTENTS: Record<FixtureKey, string> = {
  clean: "Italian restaurants with delivery",
  hard: "Italian restaurants with delivery",
  soft: "Italian restaurants with delivery",
};

async function main() {
  if (!config.apify.token) {
    console.error("No APIFY_TOKEN in .env — cannot run the live demo.");
    process.exit(1);
  }
  const fixture = (process.argv[2] as FixtureKey) ?? "hard";
  const rowCount = 12;
  const intent = INTENTS[fixture];

  renderHeader(`${intent}  [LIVE Apify · fixture: ${fixture}]`, rowCount);
  console.log(`  Actor: ${config.apify.defaultActor}  (cold start may take ~10-20s)\n`);

  const result = await runFirewall(new ApifyScraper(), {
    intent,
    actor: config.apify.defaultActor,
    query: { fixture, rowCount, delayMs: 1000 },
    tier1: { requiredFields: ["name"] },
    sampleSize: 3,
  });

  renderResult(result, intent, rowCount);
  console.log(`  ${result.stats.aborted ? "↳ Check the Apify console: the run shows ABORTED." : "↳ Run completed normally."}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
