import { config } from "../config.js";
import type { Scraper } from "../providers/scraper.js";
import { estimateTokens } from "../utils/tokens.js";
import { checkItem, type Tier1Options } from "./tier1.js";
import { judgeSample } from "./tier2.js";
import { pass, type Verdict } from "./verdict.js";

/** Live events emitted during a run — used by the web dashboard to animate the stream. */
export type FirewallEvent =
  | { type: "run_started"; runId: string }
  | { type: "item"; index: number; item: unknown } // passed Tier 1, delivered
  | { type: "tier1_block"; index: number; item: unknown; verdict: Verdict }
  | { type: "tier2_start"; sampleSize: number }
  | { type: "tier2_verdict"; verdict: Verdict }
  | { type: "done"; verdict: Verdict; stats: FirewallResult["stats"] };

export interface FirewallInput {
  intent: string; // the agent's original natural-language intent
  actor?: string;
  query: unknown; // actor input (e.g. { url, ... })
  tier1?: Tier1Options;
  sampleSize?: number;
  /** Optional live event hook (the dashboard streams these to the browser). */
  onEvent?: (e: FirewallEvent) => void;
}

export interface FirewallResult {
  verdict: Verdict;
  /** Clean items to hand back to the agent (empty if circuit broke). */
  data: unknown[];
  stats: {
    itemsStreamed: number;
    itemsDelivered: number;
    aborted: boolean;
    runId: string;
    /** Downstream tokens we prevented from entering the agent's context. */
    tokensBlocked: number;
    usdSaved: number;
  };
}

/**
 * Stream-and-judge.
 *
 * One AbortController governs the whole run. Its signal is threaded into the
 * scraper (so .abort() kills the cloud container AND stops the local reader)
 * and into the Tier 2 LLM call (so a verdict can cancel an in-flight judge).
 *
 *   Tier 1 runs on EVERY item the instant it arrives  → fail-fast in ~ms.
 *   Tier 2 fires ONCE on the first `sampleSize` items, concurrently, while
 *   the rest of the stream keeps arriving. Whichever tier blocks first wins
 *   and trips the breaker — we abort before the upstream job finishes billing.
 */
export async function runFirewall(scraper: Scraper, input: FirewallInput): Promise<FirewallResult> {
  const sampleSize = input.sampleSize ?? config.firewall.judgeSampleSize;
  const controller = new AbortController();
  const { signal } = controller;

  const delivered: unknown[] = [];
  const sample: unknown[] = [];
  let verdict: Verdict = pass();
  let itemsStreamed = 0;
  let blockedBytes = 0;

  const emit = input.onEvent ?? (() => {});

  const handle = await scraper.run({ actor: input.actor, query: input.query, signal });
  emit({ type: "run_started", runId: handle.runId });

  // When anything aborts the signal, tear down the upstream job exactly once.
  let abortStarted = false;
  const tripBreaker = (reason: string) => {
    if (abortStarted) return;
    abortStarted = true;
    controller.abort(reason);
    // fire-and-forget the cloud kill; we don't want to block returning the verdict
    void handle.abort();
  };

  // Tier 2 runs in the background and can trip the breaker on its own.
  let judgePromise: Promise<void> | null = null;

  try {
    for await (const item of handle.items) {
      if (signal.aborted) break;
      itemsStreamed++;

      // ---- Tier 1: mechanical, per-item, ~ms ----
      const t1 = checkItem(item, itemsStreamed - 1, input.tier1);
      if (!t1.ok) {
        verdict = t1;
        blockedBytes += byteLen(item);
        emit({ type: "tier1_block", index: itemsStreamed - 1, item, verdict: t1 });
        tripBreaker(`tier1:${t1.reason}`);
        break;
      }

      delivered.push(item);
      emit({ type: "item", index: itemsStreamed - 1, item });

      // ---- Tier 2: buffer a sample, then judge once, concurrently ----
      if (sample.length < sampleSize) sample.push(item);
      if (sample.length === sampleSize && !judgePromise) {
        emit({ type: "tier2_start", sampleSize });
        judgePromise = judgeSample(input.intent, sample.slice(), signal).then((t2) => {
          emit({ type: "tier2_verdict", verdict: t2 });
          if (!t2.ok && !signal.aborted) {
            verdict = t2;
            tripBreaker(`tier2:${t2.reason}`);
          }
        });
      }
    }

    // Drain the judge if it is still thinking (stream ended first).
    if (judgePromise) await judgePromise;
  } catch (err) {
    // AbortError from the stream reader is expected when we trip the breaker.
    if (!signal.aborted) throw err;
  }

  // If the breaker tripped, the delivered buffer is poisoned — drop it.
  const aborted = signal.aborted;
  const data = verdict.ok ? delivered : [];
  if (!verdict.ok && blockedBytes === 0) {
    // semantic block: count everything we would have streamed
    blockedBytes = byteLen(delivered);
  }

  const tokensBlocked = verdict.ok ? 0 : estimateTokens(blockedBytes);
  const usdSaved = (tokensBlocked / 1_000_000) * config.firewall.downstreamUsdPerMTok;

  const stats = {
    itemsStreamed,
    itemsDelivered: data.length,
    aborted,
    runId: handle.runId,
    tokensBlocked,
    usdSaved,
  };

  emit({ type: "done", verdict, stats });
  return { verdict, data, stats };
}

function byteLen(v: unknown): number {
  try {
    return Buffer.byteLength(typeof v === "string" ? v : JSON.stringify(v), "utf8");
  } catch {
    return 0;
  }
}
