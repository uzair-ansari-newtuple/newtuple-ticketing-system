import { SAMPLE_POS } from "@/data/qc";
import { createRecord, enroll, fire, getRecord, listTickets, putRecord, ticketState } from "@/lib/sm/records";
import { matchCount } from "./match";

export const PO_TYPE = "dc_po";
export const LINE_TYPE = "dc_upc_line";
export const PALLET_TYPE = "dc_pallet";
export const QC_PHOTO_TYPE = "qc_photo";

export const machines = {
  po: () => process.env.SM_QC_PO_MACHINE_NAME ?? "workflow_rwwrhtt9_ozj7v1",
  line: () => process.env.SM_QC_LINE_MACHINE_NAME ?? "workflow_d1sypkdp_stg9mc",
  pallet: () => process.env.SM_QC_PALLET_MACHINE_NAME ?? "workflow_p6zh6gv4_sgjmey",
};

const WAITING = ["PENDING", "COUNT_CHECK", "COUNT_MISMATCH"];
const SETTLED = ["VERIFIED", "EXCEPTION", "EXCEPTION_RESOLVED"];
const asNumber = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Adds a line to the PO's activity history. */
async function logPo(poId: string, type: string, detail: Record<string, unknown> = {}) {
  const record = await getRecord(poId);
  if (!record) return;
  let log: unknown[] = [];
  try {
    log = JSON.parse(String(record.data.qc_event_log || "[]"));
  } catch {}
  await putRecord(poId, { qc_event_log: JSON.stringify([...log, { type, actor: "state-machine", detail, created_at: new Date().toISOString() }]) });
}

/** Brings the sample purchase orders into the State Machine: the PO, its pallets and its UPC lines, each in its own workflow. */
export async function fetchPurchaseOrders(): Promise<{ created: string[]; existing: string[] }> {
  const created: string[] = [];
  const existing: string[] = [];
  const have = await listTickets({ fields: ["po_number"], machine: machines.po(), entityType: PO_TYPE, limit: 200 });
  const known = new Set(have.items.map((i) => String(i.fields.po_number)));

  for (const po of SAMPLE_POS) {
    if (known.has(po.number)) {
      existing.push(po.number);
      continue;
    }
    const units = po.lines.reduce((sum, l) => sum + l.expectedQty, 0);
    const record = await createRecord(PO_TYPE, {
      identifier: po.number,
      po_number: po.number,
      supplier: po.supplier,
      expected_date: po.expectedDate,
      shipment_number: po.shipment.id,
      carrier: po.shipment.carrier,
      trailer: po.shipment.trailer,
      arrived_at: po.shipment.arrivedAt,
      pallet_count: po.pallets.length,
      line_count: po.lines.length,
      unit_count: units,
      received_units: 0,
      pending_count: po.lines.length,
      verified_count: 0,
      exception_count: 0,
      open_exception_count: 0,
    });
    await putRecord(record.id, { record_id: record.id });
    await enroll(record.id, machines.po());

    for (const pallet of po.pallets) {
      const lines = po.lines.filter((l) => l.palletId === pallet.id).length;
      const p = await createRecord(PALLET_TYPE, { identifier: pallet.id, pallet_position: pallet.position, pallet_po_id: record.id, pallet_po_number: po.number, pallet_line_count: lines, pallet_open_count: lines });
      await putRecord(p.id, { record_id: p.id });
      await enroll(p.id, machines.pallet());
    }
    for (const line of po.lines) {
      const l = await createRecord(LINE_TYPE, {
        identifier: `${po.number}/${line.upc}`,
        line_po_id: record.id,
        line_po_number: po.number,
        upc: line.upc,
        sku: line.sku,
        product_name: line.name,
        pallet_number: line.palletId,
        expected_qty: line.expectedQty,
        photo_count: 0,
      });
      await putRecord(l.id, { record_id: l.id });
      await enroll(l.id, machines.line());
    }
    created.push(po.number);
  }
  return { created, existing };
}

/**
 * The count matcher: compares what was counted with what the PO asked for, saves the result and moves the UPC on.
 * It fires the follow-up transition itself, because the State Machine fires a connector's outcome trigger with a fixed key per UPC,
 * so a second count after a recount would be treated as a repeat and ignored.
 */
export async function matchLineCount(lineId: string) {
  const line = await getRecord(lineId);
  if (!line) return { status: 404, body: { detail: "UPC line not found" } };
  const expected = asNumber(line.data.expected_qty);
  const received = asNumber(line.data.received_qty);
  if (expected === null || received === null) return { status: 422, body: { detail: "The line needs an expected and a received quantity" } };
  const result = matchCount(expected, received);
  await putRecord(lineId, { count_result: result.kind.toLowerCase(), count_diff: result.diff });
  const matched = result.kind === "MATCH";
  // Another caller may have moved the UPC on already (the connector and the app both run this), which is fine.
  if ((await ticketState(lineId)).state === "COUNT_CHECK") await fire(lineId, matched ? "count_matched" : "count_mismatched").catch(() => undefined);
  return { status: 200, body: { ok: true, matched, result: result.kind, diff: result.diff } };
}

/** Re-adds up a PO from its UPC lines, keeps its pallets in step, and moves the PO along when its exceptions are all resolved. */
export async function rollUpPo(lineId: string) {
  const line = await getRecord(lineId);
  const poId = String(line?.data.line_po_id ?? "");
  if (!line || !poId) return { status: 404, body: { detail: "UPC line not found" } };

  const { items } = await listTickets({ fields: ["received_qty", "pallet_number"], filters: { line_po_id: poId }, machine: machines.line(), entityType: LINE_TYPE, limit: 200 });
  const count = (states: string[]) => items.filter((i) => states.includes(i.state)).length;
  const totals = {
    received_units: items.reduce((sum, i) => sum + (asNumber(i.fields.received_qty) ?? 0), 0),
    pending_count: count(WAITING),
    verified_count: count(["VERIFIED"]),
    exception_count: count(["EXCEPTION", "EXCEPTION_RESOLVED"]),
    open_exception_count: count(["EXCEPTION"]),
  };
  await putRecord(poId, totals);

  const pallets = await listTickets({ fields: ["pallet_po_id"], filters: { pallet_po_id: poId }, machine: machines.pallet(), entityType: PALLET_TYPE, limit: 200 });
  for (const pallet of pallets.items) {
    const record = await getRecord(pallet.id);
    const name = String(record?.data.identifier ?? "");
    const mine = items.filter((i) => i.fields.pallet_number === name);
    const open = mine.filter((i) => !SETTLED.includes(i.state)).length;
    await putRecord(pallet.id, { pallet_open_count: open });
    if (mine.length && open === 0 && pallet.state === "OPEN") await fire(pallet.id, "mark_checked");
  }

  const poState = (await ticketState(poId)).state;
  if (poState === "EXCEPTIONS_OPEN" && totals.open_exception_count === 0) await fire(poId, "resolve_exceptions");
  return { status: 200, body: { ok: true, ...totals } };
}

/** Records what happened on a PO or pallet. This stands in for a push message to the supervisor. */
export async function notifyQc(recordId: string, event: string) {
  const record = await getRecord(recordId);
  if (!record) return { status: 404, body: { detail: "Record not found" } };
  if (event === "PALLET_CHECKED") return { status: 200, body: { ok: true, event } };
  const now = new Date().toISOString();
  if (event === "QC_STARTED" && !record.data.started_at) await putRecord(recordId, { started_at: now });
  if (event === "QC_COMPLETE") await putRecord(recordId, { completed_at: now });
  await logPo(recordId, event);
  return { status: 200, body: { ok: true, delivered: true, channel: "mock-push", event } };
}
