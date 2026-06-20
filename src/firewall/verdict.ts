/** Shared types for the two-tier firewall. */

export type Tier = "tier1" | "tier2";

export type Reason =
  | "clean"
  | "blocklist_keyword" // Tier 1: matched a hard-block phrase (Cloudflare, CAPTCHA, ...)
  | "schema_invalid" // Tier 1: payload did not match the expected shape
  | "empty" // Tier 1: scraper returned nothing useful
  | "semantic_mismatch" // Tier 2: data does not match the agent's intent
  | "semantic_block"; // Tier 2: LLM recognised a block/error page in prose

export interface Verdict {
  ok: boolean;
  tier: Tier | null; // which tier produced the decision (null = passed both)
  reason: Reason;
  detail: string; // human-readable explanation for the dashboard / agent
  /** The item index (0-based) at which the verdict was reached, if applicable. */
  atItem?: number;
  confidence?: number; // Tier 2 only, 0..1
}

export const pass = (): Verdict => ({ ok: true, tier: null, reason: "clean", detail: "Passed both tiers." });

export const block = (
  tier: Tier,
  reason: Reason,
  detail: string,
  extra: Partial<Verdict> = {},
): Verdict => ({ ok: false, tier, reason, detail, ...extra });
