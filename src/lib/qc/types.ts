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

export const EXCEPTION_REASONS = {
  SHORT_SHIPMENT: "Short shipment",
  OVER_SHIPMENT: "Over shipment",
  DAMAGED: "Damaged goods",
  WRONG_ITEM: "Wrong item received",
  MISSING_LABEL: "Missing or unreadable label",
  OTHER: "Something else",
} as const;
export type ExceptionReason = keyof typeof EXCEPTION_REASONS;
