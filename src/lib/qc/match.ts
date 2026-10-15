import type { CountResult } from "./dto";

/** Compares what arrived with what the PO asked for. */
export function matchCount(expected: number, received: number): { result: CountResult; diff: number } {
  if (received === expected) return { result: "MATCH", diff: 0 };
  return received < expected ? { result: "SHORT", diff: expected - received } : { result: "OVER", diff: received - expected };
}

export function suggestedReason(result: CountResult) {
  return result === "SHORT" ? "SHORT_SHIPMENT" : result === "OVER" ? "OVER_SHIPMENT" : "DAMAGED";
}

/** Units on a pallet: full cases, each holding some bundles of MDL units, plus any loose units. */
export function palletTotal(c: { mdl_actual: number | null; bundles_per_case: number | null; full_cases_count: number | null; partial_units: number | null }) {
  return (c.full_cases_count ?? 0) * (c.bundles_per_case ?? 0) * (c.mdl_actual ?? 0) + (c.partial_units ?? 0);
}
