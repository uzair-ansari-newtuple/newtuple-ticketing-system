import type { CountResult } from "./dto";

/** Compares what arrived with what the PO asked for. */
export function matchCount(expected: number, received: number): { result: CountResult; diff: number } {
  if (received === expected) return { result: "MATCH", diff: 0 };
  return received < expected ? { result: "SHORT", diff: expected - received } : { result: "OVER", diff: received - expected };
}

export function suggestedReason(result: CountResult) {
  return result === "SHORT" ? "SHORT_SHIPMENT" : result === "OVER" ? "OVER_SHIPMENT" : "DAMAGED";
}

/** Units on a pallet from what was counted: full cases of the counted case size, plus loose units. */
export function palletTotal(c: { mdl_actual: number | null; full_cases_count: number | null; partial_units: number | null; bundles_per_case?: number | null; units_per_bundle?: number; is_prepack?: boolean }) {
  const perCase = c.is_prepack ? (c.bundles_per_case ?? 0) * (c.units_per_bundle ?? 1) : (c.mdl_actual ?? 0);
  return (c.full_cases_count ?? 0) * perCase + (c.partial_units ?? 0);
}
