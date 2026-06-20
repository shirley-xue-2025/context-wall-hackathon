import { block, pass, type Verdict } from "./verdict.js";

/**
 * Tier 1 — Mechanical Security.
 * Pure TypeScript. No network, no LLM. Target: <2ms per item.
 * Runs on EVERY streamed item so we fail-fast on the first poisoned row.
 */

// Universal "this is a block / error page, not data" signals.
// Case-insensitive, matched against the stringified item.
const BLOCKLIST: RegExp[] = [
  /cloudflare/i,
  /access\s+denied/i,
  /captcha/i,
  /are\s+you\s+(a\s+)?human/i,
  /please\s+(log|sign)\s*in/i,
  /enable\s+javascript/i,
  /verify\s+you\s+are\s+human/i,
  /rate\s*limit|too\s+many\s+requests/i,
  /attention\s+required/i, // Cloudflare's classic title
  /just\s+a\s+moment/i, // Cloudflare interstitial title
  /\b40[13]\b.*forbidden|forbidden.*\b40[13]\b/i,
  /bot\s+detection|automated\s+traffic/i,
  // Modern block-page phrasing observed from real anti-bot vendors when a plain
  // HTTP client (got-scraping, no JS) hits a protected site. These complement
  // the classics above so the firewall catches today's interstitials, not just
  // the 2020-era Cloudflare ones. (Verified live against zillow/crunchbase/g2.)
  /one\s+moment,?\s*please/i, // newer Cloudflare challenge title
  /access\s+to\s+this\s+page\s+has\s+been\s+denied/i, // PerimeterX / HUMAN
  /checking\s+your\s+browser/i, // Cloudflare "checking your browser before…"
  /\bray\s*id\b/i, // Cloudflare error-page signature (always present)
  /enable\s+js\b/i, // terse variant of "enable JavaScript"
  /humans\s+only/i, // Akamai/Glassdoor-style anti-bot wall
  /pardon\s+our\s+interruption/i, // Imperva/Distil
  /unusual\s+(traffic|activity)/i, // Google/general rate-block
  /verify\s+(your|the)\s+(session|request|connection|identity)/i,
  /\bperimeterx\b|\bdatadome\b/i, // vendor names leaking into the block page
  // The DANGEROUS case: Akamai's bot wall is served at HTTP 200 (not 403), so
  // there is NO status-code signal — the only tell is this phrase in the body.
  // Exactly the "200 success, poison content" payload ContextWall exists for.
  /powered\s+and\s+protected\s+by\s+privacy/i, // Akamai bot-manager interstitial
  /you\s+have\s+been\s+blocked/i, // Cloudflare "Sorry, you have been blocked"
];

export interface Tier1Options {
  /** Optional shape contract for each item. Empty = skip schema check. */
  requiredFields?: string[];
}

function flatten(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Inspect a single streamed item. O(payload size), no I/O. */
export function checkItem(item: unknown, index: number, opts: Tier1Options = {}): Verdict {
  const blob = flatten(item);

  if (blob.trim().length === 0 || blob === "{}" || blob === "[]") {
    return block("tier1", "empty", `Item #${index} is empty.`, { atItem: index });
  }

  for (const rx of BLOCKLIST) {
    const m = blob.match(rx);
    if (m) {
      return block(
        "tier1",
        "blocklist_keyword",
        `Item #${index} contains block-page signal: "${m[0]}".`,
        { atItem: index },
      );
    }
  }

  if (opts.requiredFields?.length && item && typeof item === "object") {
    const obj = item as Record<string, unknown>;
    for (const f of opts.requiredFields) {
      const v = obj[f];
      if (v == null || (typeof v === "string" && v.trim() === "")) {
        return block("tier1", "schema_invalid", `Item #${index} missing required field "${f}".`, {
          atItem: index,
        });
      }
    }
  }

  return pass();
}
