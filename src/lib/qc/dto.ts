export type ShipmentState = "CREATED" | "IN_PROGRESS" | "QC_COMPLETE" | "RECEIPT_IN_PROGRESS" | "CLOSED";
export type UpcState = "PENDING" | "IN_PROGRESS" | "SUPERVISOR_HOLD" | "APPROVED" | "WONT_QC";
export type PalletStatus = "PENDING" | "IN_PROGRESS" | "COMPLETE";
export type CountResult = "MATCH" | "SHORT" | "OVER";

export const FLAG_REASONS = {
  SHORT_SHIPMENT: "Short shipment",
  OVER_SHIPMENT: "Over shipment",
  DAMAGED: "Damaged goods",
  WRONG_ITEM: "Wrong item received",
  MISSING_LABEL: "Missing or unreadable label",
  OTHER: "Something else",
} as const;
export type FlagReason = keyof typeof FLAG_REASONS;

export const CHECKS = [
  ["inspect_case_opened", "Case opened and inspected"],
  ["inspect_style_confirmed", "Style matches"],
  ["inspect_color_confirmed", "Colour matches"],
  ["inspect_upc_confirmed", "UPC matches"],
  ["inspect_price_confirmed", "Price matches"],
  ["label_pallet_confirmed", "Pallet label is right"],
  ["label_cases_confirmed", "Case labels are right"],
] as const;
export type CheckKey = (typeof CHECKS)[number][0];

export interface ShipmentTotals {
  upcs: number;
  units: number;
  received: number;
  waiting: number;
  approved: number;
  on_hold: number;
  wont_qc: number;
  blocking: number;
}

export interface Shipment {
  id: string;
  po_number: string;
  shipment_number: string;
  vendor_name: string;
  vendor_code: string;
  dc_id: string;
  state: ShipmentState;
  qc_ready: boolean;
  totals: ShipmentTotals;
  started_at: string | null;
  completed_at: string | null;
  confirmation_number: string;
}

export interface Flag {
  id: string;
  reason: FlagReason;
  note: string;
  raised_at: string;
  status: "OPEN" | "RESOLVED" | "RESOLVED_RETURN_TO_QUEUE" | "RESOLVED_WONT_QC";
  resolution_note: string;
  resolved_at: string | null;
}

export interface Upc {
  id: string;
  shipment_id: string;
  po_number: string;
  upc_code: string;
  description: string;
  style_number: string;
  color_name: string;
  size_label: string;
  expected_units: number;
  shipped_cases: number;
  mdl: number;
  units_per_bundle: number;
  is_prepack: boolean;
  retail_price: string;
  state: UpcState;
  received_units: number;
  labels_complete: boolean;
  photo_count: number;
  rework_reason: string;
  flag: Flag | null;
}

export interface Pallet {
  id: string;
  label: string;
  position: number;
  status: PalletStatus;
  expected_units: number;
  checks: Record<CheckKey, boolean>;
  mdl_expected: number;
  mdl_actual: number | null;
  bundles_per_case: number | null;
  full_cases_count: number | null;
  partial_units: number | null;
  total_units: number;
}

export interface ShipmentDetail extends Shipment {
  upcs: Upc[];
}

export interface UpcDetail extends Upc {
  shipment_state: ShipmentState;
  pallets: Pallet[];
  photos: string[];
  count: { result: CountResult; diff: number } | null;
}

export interface FlaggedUpc extends Upc {
  shipment_state: ShipmentState;
}
