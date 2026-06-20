import { hasLlm } from "../config.js";
import { judgeSemantic, type SemanticVerdict } from "../providers/llm.js";
import { block, pass, type Verdict } from "./verdict.js";

/**
 * Tier 2 — Semantic Judge.
 * Runs ONCE on a small buffered sample (default 3 items) while more items
 * are still streaming. Concurrency is the point: by the time the judge
 * returns, we either let the rest of the stream through or we abort the
 * upstream container before it finishes (and bills) the full job.
 */

export async function judgeSample(
  intent: string,
  sample: unknown[],
  signal?: AbortSignal,
): Promise<Verdict> {
  if (sample.length === 0) return pass();

  let v: SemanticVerdict;
  try {
    v = hasLlm() ? await judgeSemantic(intent, sample, signal) : heuristic(intent, sample);
  } catch (err) {
    if (signal?.aborted) return pass(); // already killed by Tier 1; nothing to add
    // On an LLM error (e.g. free-tier rate limit), DEGRADE to the mechanical
    // heuristic rather than failing open — a firewall must not wave data
    // through just because its smartest check was unavailable.
    v = heuristic(intent, sample);
  }

  if (v.isBlockPage) {
    return block("tier2", "semantic_block", `Judge: ${v.reason}`, { confidence: v.confidence });
  }
  if (!v.aligned) {
    return block("tier2", "semantic_mismatch", `Judge: ${v.reason}`, { confidence: v.confidence });
  }
  return pass();
}

/**
 * Offline fallback when no API key is configured. Keyword-overlap heuristic
 * between the intent and the sample so `npm run demo` works with zero setup.
 */
function heuristic(intent: string, sample: unknown[]): SemanticVerdict {
  const blob = JSON.stringify(sample).toLowerCase();
  const words = intent
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["with", "without", "that", "have"].includes(w));

  // 1) Feature-negation check: the intent asks FOR a feature, but the sample
  //    explicitly negates it ("no delivery", "delivery": false, "without X").
  for (const kw of words) {
    const negated =
      new RegExp(`(no|without|not)\\s+${kw}`).test(blob) ||
      new RegExp(`"${kw}"\\s*:\\s*false`).test(blob) ||
      new RegExp(`${kw}\\s*:\\s*false`).test(blob);
    if (negated) {
      return {
        aligned: false,
        isBlockPage: false,
        confidence: 0.7,
        reason: `Sample explicitly negates a requested feature ("${kw}") — opposite of intent (heuristic).`,
      };
    }
  }

  // 2) Vocabulary-overlap check: sample barely relates to the intent.
  const hits = words.filter((w) => blob.includes(w)).length;
  const ratio = words.length ? hits / words.length : 1;
  if (ratio < 0.34) {
    return {
      aligned: false,
      isBlockPage: false,
      confidence: 0.55,
      reason: "Sample shares little vocabulary with the requested intent (heuristic).",
    };
  }
  return { aligned: true, isBlockPage: false, confidence: 0.5, reason: "Heuristic overlap acceptable (no LLM configured)." };
}
