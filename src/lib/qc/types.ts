export type PoStatus = "FETCHED" | "IN_PROGRESS" | "COMPLETE";
export type LineStatus = "PENDING" | "VERIFIED" | "EXCEPTION";

export interface Shipment {
  id: string;
  carrier: string;
  trailer: string;
  arrivedAt: string;
}

export interface Pallet {
  id: string;
  position: string;
}

export interface PoLine {
  upc: string;
  sku: string;
  name: string;
  expectedQty: number;
  palletId: string;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  supplier: string;
  expectedDate: string;
  shipment: Shipment;
  pallets: Pallet[];
  lines: PoLine[];
}

export interface QcException {
  reason: ExceptionReason;
  note: string;
  raisedAt: string;
  resolution: { note: string; resolvedAt: string } | null;
}

export interface LineResult {
  status: LineStatus;
  receivedQty: number;
  photo: string | null;
  exception: QcException | null;
}

export interface PoProgress {
  status: PoStatus;
  startedAt: string | null;
  completedAt: string | null;
  results: Record<string, LineResult>;
}

export const EXCEPTION_REASONS = {
  SHORT_SHIPMENT: "Short shipment",
  OVER_SHIPMENT: "Over shipment",
  DAMAGED: "Damaged goods",
  WRONG_ITEM: "Wrong item received",
  MISSING_LABEL: "Missing or unreadable label",
  OTHER: "Something else",
} as const;
export type ExceptionReason = keyof typeof EXCEPTION_REASONS;
