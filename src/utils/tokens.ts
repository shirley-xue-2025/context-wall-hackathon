/** Rough token estimate: ~4 bytes/token for English+JSON. Good enough for a "saved" counter. */
export function estimateTokens(bytes: number): number {
  return Math.round(bytes / 4);
}
