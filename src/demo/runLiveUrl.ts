import { config } from "../config.js";
import { runFirewall } from "../firewall/index.js";
import { ApifyScraper } from "../providers/apify.js";
import { renderHeader, renderResult } from "./dashboard.js";

/**
 * LIVE demo against the REAL scraping actor (context-wall-real-actor).
 *
 * Unlike runLive.ts (which sends mock-actor input {fixture,rowCount,delayMs}),
 * this sends the standard crawler shape { startUrls: [{ url }] } — exactly what
 * the `scrape_validated` MCP tool sends. The actor actually fetches the URL;
 * a Cloudflare/anti-bot site returns its block interstitial as fake success,
 * Tier 1 trips on the first row, and the run is aborted mid-stream.
 *
 *   npm run demo:url                          → disguised 200 success (the killer case)
 *   npm run demo:url -- cloudflare            → literal "Attention Required | Cloudflare" (403)
 *   npm run demo:url -- clean                 → a clean URL (passes)
 *   npm run demo:url -- https://example.com   → any custom URL
 *
 * Requires APIFY_TOKEN + APIFY_DEFAULT_ACTOR=<real actor> + CW_SCRAPER=apify.
 */
const PRESETS: Record<string, { url: string; intent: string }> = {
  // HEADLINE: HTTP 200 "success" + valid JSON, but the body is an Akamai bot
  // wall ("Powered and protected by Privacy") — a disguised failure with NO
  // status-code signal. Caught purely by reading the content. (Verified live
  // from Apify's datacenter IP, which is what actually matters for the demo.)
  blocked: { url: "https://www.homedepot.com/", intent: "Product listings with price and availability" },
  // The literal slide example: a real Cloudflare "Attention Required" interstitial
  // (served at 403, as Cloudflare actually does — not 200).
  cloudflare: { url: "https://www.yellowpages.com/", intent: "Local business listings with phone and address" },
  clean: { url: "https://books.toscrape.com/", intent: "Book titles with price and availability" },
};

async function main() {
  if (!config.apify.token) {
    console.error("No APIFY_TOKEN in .env — cannot run the live demo.");
    process.exit(1);
  }

  const arg = process.argv[2] ?? "blocked";
  const preset = PRESETS[arg];
  const url = preset?.url ?? arg;
  const intent = preset?.intent ?? "Extract the page's primary structured data";

  renderHeader(`${intent}  [LIVE Apify · ${url}]`, 1);
  console.log(`  Actor: ${config.apify.defaultActor}  (cold start may take ~10-20s)\n`);

  const result = await runFirewall(new ApifyScraper(), {
    intent,
    actor: config.apify.defaultActor,
    query: { startUrls: [{ url }] },
    tier1: { requiredFields: ["title"] },
    sampleSize: 3,
  });

  renderResult(result, intent, 1);
  console.log(
    `  ${result.stats.aborted ? "↳ Check the Apify console: the run shows ABORTED." : "↳ Run completed normally."}\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
