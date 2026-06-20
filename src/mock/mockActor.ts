import type { Scraper, ScrapeHandle } from "../providers/scraper.js";
import { FIXTURES, type FixtureKey } from "./fixtures.js";

/**
 * A mock Apify actor that streams a fixture row-by-row with a realistic delay,
 * and honours an AbortSignal exactly like the real cloud client. This lets us
 * PROVE the circuit breaker fired BEFORE the upstream "finished" — i.e. we
 * stopped paying. Watch the logged "rows emitted" count: a broken circuit
 * emits ~4 of 12, not all 12.
 */
export class MockScraper implements Scraper {
  constructor(
    private fixture: FixtureKey,
    private opts: { delayMs?: number; onEmit?: (i: number) => void } = {},
  ) {}

  async run({ signal }: { signal: AbortSignal }): Promise<ScrapeHandle> {
    const rows = FIXTURES[this.fixture].rows;
    const delayMs = this.opts.delayMs ?? 120;
    const onEmit = this.opts.onEmit;
    let killed = false;

    const items = (async function* () {
      for (let i = 0; i < rows.length; i++) {
        if (signal.aborted || killed) return; // upstream container stops producing
        await sleep(delayMs, signal);
        if (signal.aborted || killed) return;
        onEmit?.(i + 1);
        yield rows[i];
      }
    })();

    return {
      runId: `mock-${this.fixture}-run`,
      items,
      async abort() {
        killed = true;
      },
    };
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}
