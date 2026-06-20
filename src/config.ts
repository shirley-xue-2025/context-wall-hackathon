import "dotenv/config";

export const config = {
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? "",
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite",
  },
  apify: {
    token: process.env.APIFY_TOKEN ?? "",
    defaultActor: process.env.APIFY_DEFAULT_ACTOR ?? "apify/website-content-crawler",
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    model: process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash-lite",
  },
  firewall: {
    judgeSampleSize: Number(process.env.CW_JUDGE_SAMPLE_SIZE ?? 3),
    downstreamUsdPerMTok: Number(process.env.CW_DOWNSTREAM_USD_PER_MTOK ?? 3.0),
  },
  // "mock" forces bundled fixtures; "apify" uses the live cloud.
  scraper: (process.env.CW_SCRAPER ?? "mock") as "mock" | "apify",
} as const;

export const hasLlm = () => Boolean(config.gemini.apiKey);
