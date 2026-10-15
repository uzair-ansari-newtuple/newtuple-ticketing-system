import type { PurchaseOrder } from "@/lib/qc/types";

const line = (sku: string, name: string, expectedQty: number, palletId: string) => ({ upc: sku, sku, name, expectedQty, palletId });

/** Sample purchase orders for the demo, built from products in the catalog so their photos show. */
export const SAMPLE_POS: PurchaseOrder[] = [
  {
    id: "po-45001234",
    number: "PO-45001234",
    supplier: "Bright Kids Apparel Co.",
    expectedDate: "2026-10-14",
    shipment: { id: "SHP-88231", carrier: "XPO Logistics", trailer: "TRL-5521", arrivedAt: "2026-10-14T06:40:00Z" },
    pallets: [{ id: "PLT-1001", position: "Dock 3 · Bay A" }, { id: "PLT-1002", position: "Dock 3 · Bay B" }],
    lines: [
      line("400414405536", "Flower Applique", 48, "PLT-1001"),
      line("400427758582", "Bubble Charmed", 36, "PLT-1001"),
      line("400428390682", "Varsity Patch", 60, "PLT-1002"),
      line("400429151992", "Frayed Cargo", 24, "PLT-1002"),
    ],
  },
  {
    id: "po-45001301",
    number: "PO-45001301",
    supplier: "Sunrise Accessories Ltd.",
    expectedDate: "2026-10-15",
    shipment: { id: "SHP-88302", carrier: "FedEx Freight", trailer: "TRL-7710", arrivedAt: "2026-10-15T05:15:00Z" },
    pallets: [{ id: "PLT-2001", position: "Dock 1 · Bay C" }],
    lines: [
      line("400425657702", "Butterflies", 120, "PLT-2001"),
      line("400427725416", "Bluetooth Party", 40, "PLT-2001"),
      line("400430990016", "Bling Hands", 72, "PLT-2001"),
    ],
  },
  {
    id: "po-45001377",
    number: "PO-45001377",
    supplier: "Harbor Home & Bath",
    expectedDate: "2026-10-15",
    shipment: { id: "SHP-88377", carrier: "Old Dominion", trailer: "TRL-3308", arrivedAt: "2026-10-15T07:50:00Z" },
    pallets: [{ id: "PLT-3001", position: "Dock 2 · Bay A" }, { id: "PLT-3002", position: "Dock 2 · Bay D" }],
    lines: [
      line("400427535091", "Bath Set", 30, "PLT-3001"),
      line("400424212551", "White Set", 54, "PLT-3001"),
      line("400426575692", "Barbie Bus", 18, "PLT-3002"),
      line("400429495294", "Rhinestones", 90, "PLT-3002"),
      line("400427936874", "Horseshoe", 66, "PLT-3002"),
    ],
  },
  {
    id: "po-45001402",
    number: "PO-45001402",
    supplier: "Metro Outerwear Group",
    expectedDate: "2026-10-16",
    shipment: { id: "SHP-88411", carrier: "Estes Express", trailer: "TRL-1194", arrivedAt: "2026-10-15T09:05:00Z" },
    pallets: [{ id: "PLT-4001", position: "Dock 4 · Bay B" }],
    lines: [
      line("400425792922", "Shacket", 84, "PLT-4001"),
      line("400431701338", "Red Mints", 200, "PLT-4001"),
    ],
  },
];
