/**
 * Three fixtures that drive the whole demo:
 *   clean → passes both tiers
 *   hard  → structurally perfect JSON, but every row is Cloudflare trash (Tier 1)
 *   soft  → valid restaurant data, but the OPPOSITE of what was asked (Tier 2)
 *
 * The "hard" fixture is the killer point: HTTP 200, well-formed JSON wrapper,
 * passes a naive Zod check — yet it is 100% toxic. Only a content firewall catches it.
 */

export type FixtureKey = "clean" | "hard" | "soft";

export interface DemoScenario {
  intent: string;
  rows: unknown[];
}

const cleanRows = Array.from({ length: 12 }, (_, i) => ({
  name: `Trattoria ${i + 1}`,
  rating: 4.0 + (i % 9) / 10,
  delivery: true,
  cuisine: "Italian",
  address: `${100 + i} Market St`,
}));

// Perfectly shaped objects whose VALUES are block-page text.
const hardRows = Array.from({ length: 12 }, (_, i) => ({
  name: i % 2 === 0 ? "Attention Required! | Cloudflare" : "Just a moment...",
  rating: null,
  delivery: null,
  cuisine: null,
  address: "Please enable JavaScript and cookies to continue. Ray ID: 8a1f" + i,
}));

// Real data, wrong data: asked for delivery, got the explicit opposite.
const softRows = Array.from({ length: 12 }, (_, i) => ({
  name: `Dine-In Bistro ${i + 1}`,
  rating: 4.1 + (i % 8) / 10,
  delivery: false,
  cuisine: "French",
  address: `${200 + i} 5th Ave`,
  note: "Dine-in only. No delivery or takeout offered.",
}));

export const FIXTURES: Record<FixtureKey, DemoScenario> = {
  clean: { intent: "Italian restaurants with delivery", rows: cleanRows },
  hard: { intent: "Italian restaurants with delivery", rows: hardRows },
  soft: { intent: "Italian restaurants with delivery", rows: softRows },
};
