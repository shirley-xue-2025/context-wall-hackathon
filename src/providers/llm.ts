import { GoogleGenAI, Type } from "@google/genai";
import { config, hasLlm } from "../config.js";

/**
 * Tier 2 backend. Uses Google AI Studio (Gemini) with a strict
 * responseSchema so we get a guaranteed, parse-free structured verdict.
 *
 * If no GEMINI_API_KEY is set, callers should use the heuristic fallback
 * in tier2.ts instead — the demo stays runnable fully offline.
 */

export interface SemanticVerdict {
  aligned: boolean; // does the sample match the agent's intent?
  isBlockPage: boolean; // is this actually an error / block / login page?
  confidence: number; // 0..1
  reason: string; // one short sentence
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    aligned: { type: Type.BOOLEAN },
    isBlockPage: { type: Type.BOOLEAN },
    confidence: { type: Type.NUMBER },
    reason: { type: Type.STRING },
  },
  required: ["aligned", "isBlockPage", "confidence", "reason"],
};

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  return client;
}

export async function judgeSemantic(
  intent: string,
  sample: unknown[],
  signal?: AbortSignal,
): Promise<SemanticVerdict> {
  if (!hasLlm()) throw new Error("No GEMINI_API_KEY — use heuristic fallback");

  const prompt = [
    `You are a data-quality firewall. An AI agent requested data with this intent:`,
    `INTENT: "${intent}"`,
    ``,
    `Here is a small sample of what the scraper returned (JSON):`,
    "```json",
    JSON.stringify(sample, null, 2).slice(0, 6000),
    "```",
    ``,
    `Decide:`,
    `- isBlockPage: true if this is an anti-bot / CAPTCHA / login / error page rather than real data.`,
    `- aligned: true ONLY if the data genuinely satisfies the agent's intent.`,
    `Be strict. When unsure, set the unsafe value (isBlockPage=true / aligned=false).`,
  ].join("\n");

  const res = await getClient().models.generateContent({
    model: config.gemini.model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
    // NOTE: pass `signal` via httpOptions/abortSignal once your @google/genai
    // version supports it; the orchestrator also re-checks signal.aborted after.
  });
  void signal;

  const text = res.text ?? "{}";
  return JSON.parse(text) as SemanticVerdict;
}
