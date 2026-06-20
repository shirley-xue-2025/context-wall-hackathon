import { runFirewall } from "../firewall/index.js";
import { FIXTURES, type FixtureKey } from "../mock/fixtures.js";
import { MockScraper } from "../mock/mockActor.js";
import { logEmit, renderHeader, renderResult } from "./dashboard.js";

/**
 * Usage:
 *   npm run demo            → runs all three scenarios in sequence
 *   npm run demo hard       → runs just the Cloudflare hard-fail
 *   npm run demo:clean|hard|soft
 *
 * Watch the "rows upstream produced" line: on a block it is far below the
 * total, proving we killed the cloud job before it finished billing.
 */
async function runScenario(key: FixtureKey) {
  const { intent, rows } = FIXTURES[key];
  renderHeader(`${intent}  [scenario: ${key}]`, rows.length);

  const scraper = new MockScraper(key, { delayMs: 100, onEmit: logEmit });
  const result = await runFirewall(scraper, {
    intent,
    query: { fixture: key },
    tier1: { requiredFields: ["name"] },
    sampleSize: 3,
  });

  renderResult(result, intent, rows.length);
}

async function main() {
  const arg = process.argv[2] as FixtureKey | undefined;
  const order: FixtureKey[] = arg ? [arg] : ["clean", "hard", "soft"];
  for (const key of order) {
    await runScenario(key);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
