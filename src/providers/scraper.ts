/**
 * A Scraper is anything that yields dataset items one at a time and can be
 * told to stop. Both the live Apify client and the mock fixtures implement it,
 * so the firewall never knows or cares which one it is talking to.
 */
export interface ScrapeHandle {
  /** Async stream of dataset items as the cloud run produces them. */
  items: AsyncIterable<unknown>;
  /** Kill the upstream job (stops billing). Idempotent. */
  abort(): Promise<void>;
  /** For the dashboard: an id/label for the run. */
  runId: string;
}

export interface Scraper {
  run(input: { actor?: string; query: unknown; signal: AbortSignal }): Promise<ScrapeHandle>;
}
