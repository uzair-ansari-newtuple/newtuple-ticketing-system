export interface SeedUpc {
  sku: string;
  name: string;
  units: number;
  pallets: number;
}

export interface SeedShipment {
  po_number: string;
  shipment_number: string;
  vendor_code: string;
  vendor_name: string;
  dc_id: string;
  upcs: SeedUpc[];
}

const DC = "DC-ATL-01";
/** Units in one bundle (MDL) and bundles in a full case, as the PO says. */
export const MDL = 6;
export const BUNDLES_PER_CASE = 4;
export const CASE_SIZE = MDL * BUNDLES_PER_CASE;

/** Sample shipments for the demo, built from catalog products so their photos show. */
export const SEED_SHIPMENTS: SeedShipment[] = [
  {
    po_number: "PO-45001234",
    shipment_number: "SHP-88231",
    vendor_code: "V-1042",
    vendor_name: "Bright Kids Apparel Co.",
    dc_id: DC,
    upcs: [
      { sku: "400414405536", name: "Flower Applique", units: 48, pallets: 1 },
      { sku: "400427758582", name: "Bubble Charmed", units: 36, pallets: 1 },
      { sku: "400428390682", name: "Varsity Patch", units: 60, pallets: 2 },
      { sku: "400429151992", name: "Frayed Cargo", units: 24, pallets: 1 },
    ],
  },
  {
    po_number: "PO-45001301",
    shipment_number: "SHP-88302",
    vendor_code: "V-2210",
    vendor_name: "Sunrise Accessories Ltd.",
    dc_id: DC,
    upcs: [
      { sku: "400425657702", name: "Butterflies", units: 120, pallets: 2 },
      { sku: "400427725416", name: "Bluetooth Party", units: 40, pallets: 1 },
      { sku: "400430990016", name: "Bling Hands", units: 72, pallets: 1 },
    ],
  },
  {
    po_number: "PO-45001377",
    shipment_number: "SHP-88377",
    vendor_code: "V-3307",
    vendor_name: "Harbor Home & Bath",
    dc_id: DC,
    upcs: [
      { sku: "400427535091", name: "Bath Set", units: 30, pallets: 1 },
      { sku: "400424212551", name: "White Set", units: 54, pallets: 1 },
      { sku: "400426575692", name: "Barbie Bus", units: 18, pallets: 1 },
      { sku: "400429495294", name: "Rhinestones", units: 90, pallets: 2 },
      { sku: "400427936874", name: "Horseshoe", units: 66, pallets: 1 },
    ],
  },
  {
    po_number: "PO-45001402",
    shipment_number: "SHP-88411",
    vendor_code: "V-4120",
    vendor_name: "Metro Outerwear Group",
    dc_id: DC,
    upcs: [
      { sku: "400425792922", name: "Shacket", units: 84, pallets: 1 },
      { sku: "400431701338", name: "Red Mints", units: 200, pallets: 2 },
    ],
  },
];
