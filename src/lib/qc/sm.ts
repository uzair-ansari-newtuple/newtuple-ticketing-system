import { BUNDLES_PER_CASE, CASE_SIZE, MDL, SEED_SHIPMENTS } from "@/data/qc";
import { createRecord, enroll, fire, getRecord, listRecords, listTickets, putRecord, type SmRecord, type TicketListItem } from "@/lib/sm/records";

export const SHIPMENT_TYPE = "shipment";
export const UPC_TYPE = "upc";
export const PALLET_TYPE = "pallet";
export const FLAG_TYPE = "dcqc_flag";
export const NOTIFICATION_TYPE = "dcqc_notification";
export const QC_PHOTO_TYPE = "qc_photo";

export const machines = {
  shipment: () => process.env.SM_DCQC_SHIPMENT_MACHINE_NAME ?? "workflow_16vxtmhg_icn0of",
  upc: () => process.env.SM_DCQC_UPC_MACHINE_NAME ?? "workflow_bbt46ntb_5ymb45",
};

/** A UPC that still stops its shipment from finishing QC. */
export const BLOCKING = ["PENDING", "IN_PROGRESS", "SUPERVISOR_HOLD"];

export async function allOf(machine: string, entityType: string, fields: string[], filters?: Record<string, string>): Promise<TicketListItem[]> {
  const items: TicketListItem[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await listTickets({ fields, filters, machine, entityType, limit: 200, offset });
    items.push(...page.items);
    if (page.items.length < 200) return items;
  }
}

/** Plain records of a type whose `field` equals `value`. */
export async function recordsWhere(typeName: string, field: string, value: string): Promise<SmRecord[]> {
  return (await listRecords(typeName, { search: value, limit: 100 })).filter((r) => r.data[field] === value);
}

type SeedShipment = (typeof SEED_SHIPMENTS)[number];
type SeedUpc = SeedShipment["upcs"][number];

export const shipmentSeed = (s: SeedShipment) => {
  const units = s.upcs.reduce((sum, u) => sum + u.units, 0);
  return {
    identifier: s.po_number,
    legacy_po_id: s.po_number,
    po_number: s.po_number,
    shipment_number: s.shipment_number,
    dc_id: s.dc_id,
    vendor_code: s.vendor_code,
    vendor_name: s.vendor_name,
    dcqc_qc_ready: false,
    dcqc_blocking_upc_count: s.upcs.length,
    dcqc_evidence_revision: 0,
    expected_units: units,
    shipped_total_units: units,
    expected_total_cases: s.upcs.reduce((sum, u) => sum + Math.ceil(u.units / CASE_SIZE), 0),
    expected_pallets: s.upcs.reduce((sum, u) => sum + u.pallets, 0),
    is_active: true,
  };
};

export const upcSeed = (s: SeedShipment, shipmentId: string, u: SeedUpc) => ({
  identifier: `${s.po_number}/${u.sku}`,
  legacy_upc_id: `${s.po_number}-${u.sku}`,
  upc_code: u.sku,
  item_description: u.name,
  style_number: `ST-${u.sku.slice(-4)}`,
  color_code: "MLT",
  color_name: "Multicolor",
  size_label: "OS",
  expected_units: u.units,
  shipped_units: u.units,
  shipped_cases: Math.ceil(u.units / CASE_SIZE),
  mdl: MDL,
  units_per_bundle: MDL,
  is_prepack: true,
  retail_price: "4.99",
  suggested_retail: "4.99",
  legacy_po_id: shipmentId,
  po_number: s.po_number,
  dc_id: s.dc_id,
  dcqc_received_units: 0,
  dcqc_labels_complete: false,
  allocatable_location_confirmed: false,
  dcqc_evidence_revision: 0,
});

async function createUpc(s: SeedShipment, shipmentId: string, u: SeedUpc): Promise<string> {
  const upc = await createRecord(UPC_TYPE, upcSeed(s, shipmentId, u));
  await putRecord(upc.id, { dcqc_record_id: upc.id });
  await enroll(upc.id, machines.upc());
  return upc.id;
}

/** Creates the pallets of a UPC that it does not have yet. The expected units are shared across the pallets, the first ones taking the larger share. */
async function createMissingPallets(s: SeedShipment, shipmentId: string, upcId: string, u: SeedUpc): Promise<void> {
  const have = new Set((await recordsWhere(PALLET_TYPE, "upc_record_id", upcId)).map((p) => Number(p.data.position)));
  const base = Math.floor(u.units / u.pallets / CASE_SIZE) * CASE_SIZE;
  await Promise.all(Array.from({ length: u.pallets }, async (_, i) => {
    if (have.has(i + 1)) return;
    const share = i === u.pallets - 1 ? u.units - base * (u.pallets - 1) : base;
    const pallet = await createRecord(PALLET_TYPE, {
      identifier: `PLT-${u.sku.slice(-4)}-${i + 1}`,
      legacy_pallet_id: `${s.po_number}-${u.sku}-${i + 1}`,
      pallet_label: `PLT-${u.sku.slice(-4)}-${i + 1}`,
      position: i + 1,
      dcqc_pallet_status: "PENDING",
      mdl_expected: MDL,
      bundles_expected: BUNDLES_PER_CASE,
      expected_units: share,
      dcqc_partial_units: 0,
      dcqc_total_units: 0,
      upc_record_id: upcId,
      shipment_record_id: shipmentId,
      po_number: s.po_number,
    });
    await putRecord(pallet.id, { record_id: pallet.id });
  }));
}

/** Brings the sample shipments into the State Machine: the shipment, its UPCs and their pallets. Anything already there is kept, anything missing is added. */
export async function fetchShipments(): Promise<{ created: string[]; existing: string[] }> {
  const created: string[] = [];
  const existing: string[] = [];
  const have = await allOf(machines.shipment(), SHIPMENT_TYPE, ["po_number"]);
  const known = new Map(have.map((i) => [String(i.fields.po_number), i.id]));

  for (const s of SEED_SHIPMENTS) {
    let shipmentId = known.get(s.po_number);
    let added = false;
    if (!shipmentId) {
      const shipment = await createRecord(SHIPMENT_TYPE, shipmentSeed(s));
      await putRecord(shipment.id, { record_id: shipment.id });
      await enroll(shipment.id, machines.shipment());
      shipmentId = shipment.id;
      added = true;
    }

    const upcsHere = new Map((await allOf(machines.upc(), UPC_TYPE, ["upc_code"], { po_number: s.po_number })).map((i) => [String(i.fields.upc_code), i.id]));
    const id = shipmentId;
    await Promise.all(s.upcs.map(async (u) => {
      let upcId = upcsHere.get(u.sku);
      if (!upcId) {
        upcId = await createUpc(s, id, u);
        added = true;
      }
      const before = (await recordsWhere(PALLET_TYPE, "upc_record_id", upcId)).length;
      await createMissingPallets(s, id, upcId, u);
      if (before < u.pallets) added = true;
    }));
    (added ? created : existing).push(s.po_number);
  }
  return { created, existing };
}

/** Keeps the shipment's QC-ready flag and blocking count in step with its UPCs. The State Machine checks both before QC can be submitted. */
export async function rollUpShipment(upcId: string) {
  const upc = await getRecord(upcId);
  const shipmentId = String(upc?.data.legacy_po_id ?? "");
  if (!upc || !shipmentId) return { status: 404, body: { detail: "UPC not found" } };
  const count = async () => (await allOf(machines.upc(), UPC_TYPE, ["dcqc_received_units"], { legacy_po_id: shipmentId })).filter((u) => BLOCKING.includes(u.state)).length;
  const save = (blocking: number) => putRecord(shipmentId, { dcqc_blocking_upc_count: blocking, dcqc_qc_ready: blocking === 0 });
  let blocking = await count();
  await save(blocking);
  // The connector can run a moment before the UPC's new state is visible to a list, so look again once it has settled.
  await new Promise((r) => setTimeout(r, 1500));
  const settled = await count();
  if (settled !== blocking) {
    blocking = settled;
    await save(blocking);
  }
  return { status: 200, body: { ok: true, blocking, qc_ready: blocking === 0 } };
}

const MESSAGES: Record<string, (d: Record<string, unknown>) => { to: string; text: string }> = {
  QC_STARTED: (d) => ({ to: "supervisor", text: `QC started on ${d.po_number}` }),
  QC_COMPLETE: (d) => ({ to: "supervisor", text: `QC is complete on ${d.po_number} and ready for receipt` }),
  RECEIPT_CLOSED: (d) => ({ to: "associate", text: `Receipt closed on ${d.po_number} (${d.confirmation_number})` }),
  UPC_FLAGGED: (d) => ({ to: "supervisor", text: `${d.item_description} (${d.upc_code}) on ${d.po_number} needs a supervisor` }),
};

/** Sends a message about a shipment or UPC and records it, standing in for a push message. Also stamps the start and completion times. */
export async function notifyQc(recordId: string, event: string) {
  const record = await getRecord(recordId);
  if (!record) return { status: 404, body: { detail: "Record not found" } };
  const now = new Date().toISOString();
  if (event === "QC_STARTED" && !record.data.started_at) await putRecord(recordId, { started_at: now });
  if (event === "QC_COMPLETE") await putRecord(recordId, { completed_at: now });
  const message = MESSAGES[event]?.(record.data) ?? { to: "supervisor", text: event };
  await createRecord(NOTIFICATION_TYPE, { identifier: `${event}-${recordId.slice(0, 8)}-${Date.now().toString(36)}`, event, recipient: message.to, message: message.text, po_number: record.data.po_number, record_id: recordId, created_at: now });
  return { status: 200, body: { ok: true, delivered: true, channel: "mock-push", event } };
}

/** The count matcher: adds up the UPC's pallets, checks the labels and saves the result on the UPC. */
export async function matchUpcCount(upcId: string) {
  const upc = await getRecord(upcId);
  if (!upc || upc.data.upc_code === undefined) return { status: 404, body: { detail: "UPC not found" } };
  const pallets = await recordsWhere(PALLET_TYPE, "upc_record_id", upcId);
  const received = pallets.reduce((sum, p) => sum + Number(p.data.dcqc_total_units ?? 0), 0);
  const labels = pallets.length > 0 && pallets.every((p) => p.data.label_pallet_confirmed === true && p.data.label_cases_confirmed === true);
  await putRecord(upcId, { dcqc_received_units: received, dcqc_labels_complete: labels });
  const expected = Number(upc.data.expected_units ?? 0);
  return { status: 200, body: { ok: true, received, expected, result: received === expected ? "MATCH" : received < expected ? "SHORT" : "OVER", labels_complete: labels } };
}

export { fire };
