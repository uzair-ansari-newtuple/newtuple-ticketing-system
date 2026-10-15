export type CountMatch = { kind: "MATCH" | "SHORT" | "OVER"; diff: number };

/** Compares what arrived with what the PO asked for. */
export function matchCount(expected: number, received: number): CountMatch {
  if (received === expected) return { kind: "MATCH", diff: 0 };
  return received < expected ? { kind: "SHORT", diff: expected - received } : { kind: "OVER", diff: received - expected };
}

export function suggestedReason(match: CountMatch) {
  return match.kind === "SHORT" ? "SHORT_SHIPMENT" : match.kind === "OVER" ? "OVER_SHIPMENT" : "DAMAGED";
}
