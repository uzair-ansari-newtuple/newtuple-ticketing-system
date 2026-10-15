import type { ExceptionReason } from "./types";

export type PoState = "FETCHED" | "QC_IN_PROGRESS" | "EXCEPTIONS_OPEN" | "QC_COMPLETE";
export type LineState = "PENDING" | "COUNT_CHECK" | "COUNT_MISMATCH" | "VERIFIED" | "EXCEPTION" | "EXCEPTION_RESOLVED";
export type CountResult = "match" | "short" | "over";

export interface QcTotals {
  lines: number;
  units: number;
  received: number;
  pending: number;
  verified: number;
  exceptions: number;
  open_exceptions: number;
}

export interface QcPo {
  id: string;
  number: string;
  supplier: string;
  expected_date: string;
  shipment: { id: string; carrier: string; trailer: string; arrived_at: string | null };
  state: PoState;
  totals: QcTotals;
  started_at: string | null;
  completed_at: string | null;
}

export interface QcLine {
  id: string;
  po_id: string;
  po_number: string;
  upc: string;
  sku: string;
  name: string;
  pallet: string;
  expected_qty: number;
  received_qty: number | null;
  state: LineState;
  count_result: CountResult | null;
  count_diff: number;
  photo_count: number;
  exception: {
    reason: ExceptionReason;
    note: string;
    raised_at: string | null;
    resolution: { note: string; resolved_at: string | null } | null;
  } | null;
}

export interface QcPallet {
  id: string;
  name: string;
  position: string;
  state: "OPEN" | "CHECKED";
}

export interface QcPoDetail extends QcPo {
  pallets: QcPallet[];
  lines: QcLine[];
  activity: { type: string; actor: string; created_at: string }[];
}

export interface QcLineDetail extends QcLine {
  photos: string[];
  po_state: PoState;
}
