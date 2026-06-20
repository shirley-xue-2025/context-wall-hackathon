import { ApifyClient } from "apify-client";
import { config } from "../config.js";
import type { Scraper, ScrapeHandle } from "./scraper.js";

/**
 * Live Apify adapter.
 *
 * Apify runs are async cloud jobs that push items into a dataset. We start the
 * run WITHOUT waiting for it to finish, then incrementally page the dataset
 * (offset/limit) while the run is RUNNING — yielding items as they appear.
 * That "polling stream" is what lets Tier 1/Tier 2 judge the first few rows
 * and ABORT the run mid-flight via the REST `abort` endpoint, stopping billing.
 */
export class ApifyScraper implements Scraper {
  private client = new ApifyClient({ token: config.apify.token });

  async run({
    actor,
    query,
    signal,
  }: {
    actor?: string;
    query: unknown;
    signal: AbortSignal;
  }): Promise<ScrapeHandle> {
    const actorId = actor ?? config.apify.defaultActor;
    // Start the run; do NOT block on completion.
    const run = await this.client.actor(actorId).start(query as Record<string, unknown>);
    const runId = run.id;
    const datasetId = run.defaultDatasetId;
    const client = this.client;

    const items = (async function* () {
      let offset = 0;
      while (!signal.aborted) {
        const page = await client.dataset(datasetId).listItems({ offset, limit: 50, clean: true });
        for (const it of page.items) {
          if (signal.aborted) return;
          yield it;
        }
        offset += page.items.length;

        const status = (await client.run(runId).get())?.status;
        const finished = status && status !== "RUNNING" && status !== "READY";
        if (finished && offset >= page.total) return; // drained + run done
        if (!finished) await sleep(750, signal); // let more items accrue
      }
    })();

    return {
      runId,
      items,
      async abort() {
        try {
          await client.run(runId).abort();
        } catch {
          /* already finished / aborted */
        }
      },
    };
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });
}
