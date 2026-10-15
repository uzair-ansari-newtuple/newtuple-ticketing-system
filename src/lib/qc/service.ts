import { smDownload, smFetch, smUpload } from "@/lib/sm/client";
import { fire, getRecord, listTickets, putRecord, ticketState, type TicketListItem } from "@/lib/sm/records";
import type { CountResult, LineState, PoState, QcLine, QcLineDetail, QcPo, QcPoDetail, QcTotals } from "./dto";
import { LINE_TYPE, machines, matchLineCount, PALLET_TYPE, PO_TYPE, QC_PHOTO_TYPE, rollUpPo } from "./sm";
import { EXCEPTION_REASONS, type ExceptionReason } from "./types";

const PO_FIELDS = ["po_number", "supplier", "expected_date", "shipment_number", "carrier", "trailer", "arrived_at", "started_at", "completed_at"];
const LINE_FIELDS = ["line_po_id", "line_po_number", "upc", "sku", "product_name", "pallet_number", "expected_qty", "received_qty", "count_result", "count_diff", "photo_count", "exception_reason", "exception_note", "exception_raised_at", "resolution_note", "resolved_at"];
const WAITING: LineState[] = ["PENDING", "COUNT_CHECK", "COUNT_MISMATCH"];

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const text = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export class QcError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function allOf(machine: string, entityType: string, fields: string[], filters?: Record<string, string>): Promise<TicketListItem[]> {
  const items: TicketListItem[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await listTickets({ fields, filters, machine, entityType, limit: 200, offset });
    items.push(...page.items);
    if (page.items.length < 200) return items;
  }
}

function lineFrom(i: TicketListItem): QcLine {
  const f = i.fields;
  const reason = text(f.exception_reason).toUpperCase() as ExceptionReason;
  return {
    id: i.id,
    po_id: text(f.line_po_id),
    po_number: text(f.line_po_number),
    upc: text(f.upc),
    sku: text(f.sku),
    name: text(f.product_name),
    pallet: text(f.pallet_number),
    expected_qty: num(f.expected_qty) ?? 0,
    received_qty: num(f.received_qty),
    state: i.state as LineState,
    count_result: (text(f.count_result) || null) as CountResult | null,
    count_diff: num(f.count_diff) ?? 0,
    photo_count: num(f.photo_count) ?? 0,
    exception: reason in EXCEPTION_REASONS ? { reason, note: text(f.exception_note), raised_at: text(f.exception_raised_at) || null, resolution: text(f.resolution_note) ? { note: text(f.resolution_note), resolved_at: text(f.resolved_at) || null } : null } : null,
  };
}

/** Totals worked out from the lines themselves, so they are right even a moment before the State Machine roll-up has run. */
function totalsOf(lines: QcLine[]): QcTotals {
  const count = (states: LineState[]) => lines.filter((l) => states.includes(l.state)).length;
  return {
    lines: lines.length,
    units: lines.reduce((s, l) => s + l.expected_qty, 0),
    received: lines.reduce((s, l) => s + (l.received_qty ?? 0), 0),
    pending: count(WAITING),
    verified: count(["VERIFIED"]),
    exceptions: count(["EXCEPTION", "EXCEPTION_RESOLVED"]),
    open_exceptions: count(["EXCEPTION"]),
  };
}

const poFrom = (i: TicketListItem, lines: QcLine[]): QcPo => ({
  id: i.id,
  number: text(i.fields.po_number),
  supplier: text(i.fields.supplier),
  expected_date: text(i.fields.expected_date),
  shipment: { id: text(i.fields.shipment_number), carrier: text(i.fields.carrier), trailer: text(i.fields.trailer), arrived_at: text(i.fields.arrived_at) || null },
  state: i.state as PoState,
  totals: totalsOf(lines),
  started_at: text(i.fields.started_at) || null,
  completed_at: text(i.fields.completed_at) || null,
});

export async function listPos(): Promise<QcPo[]> {
  const [pos, lines] = await Promise.all([allOf(machines.po(), PO_TYPE, PO_FIELDS), allOf(machines.line(), LINE_TYPE, LINE_FIELDS)]);
  const byPo = new Map<string, QcLine[]>();
  for (const l of lines.map(lineFrom)) byPo.set(l.po_id, [...(byPo.get(l.po_id) ?? []), l]);
  return pos.map((p) => poFrom(p, byPo.get(p.id) ?? [])).sort((a, b) => a.number.localeCompare(b.number));
}

export async function getPo(id: string): Promise<QcPoDetail | null> {
  const record = await getRecord(id);
  if (!record || record.data.po_number === undefined) return null;
  const [state, lineItems, palletItems] = await Promise.all([
    ticketState(id).then((s) => s.state),
    allOf(machines.line(), LINE_TYPE, LINE_FIELDS, { line_po_id: id }),
    allOf(machines.pallet(), PALLET_TYPE, ["identifier", "pallet_position"], { pallet_po_id: id }),
  ]);
  const lines = lineItems.map(lineFrom).sort((a, b) => a.pallet.localeCompare(b.pallet) || a.name.localeCompare(b.name));
  const po = poFrom({ id, state, fields: record.data, created_at: record.created_at, updated_at: record.updated_at }, lines);
  let activity: QcPoDetail["activity"] = [];
  try {
    activity = JSON.parse(text(record.data.qc_event_log) || "[]");
  } catch {}
  return {
    ...po,
    lines,
    pallets: palletItems.map((p) => ({ id: p.id, name: text(p.fields.identifier), position: text(p.fields.pallet_position), state: p.state as "OPEN" | "CHECKED" })).sort((a, b) => a.name.localeCompare(b.name)),
    activity,
  };
}

async function poStateOf(poId: string): Promise<PoState> {
  return (await ticketState(poId)).state as PoState;
}

export async function startPos(ids: string[]): Promise<void> {
  for (const id of ids) {
    const state = await poStateOf(id);
    if (state === "FETCHED") await fire(id, "start_qc");
  }
}

async function loadLine(id: string): Promise<{ line: QcLine; poState: PoState }> {
  const record = await getRecord(id);
  if (!record || record.data.upc === undefined) throw new QcError(404, "UPC line not found");
  const state = (await ticketState(id)).state;
  const line = lineFrom({ id, state, fields: record.data, created_at: record.created_at, updated_at: record.updated_at });
  return { line, poState: await poStateOf(line.po_id) };
}

export async function getLine(id: string): Promise<QcLineDetail> {
  const { line, poState } = await loadLine(id);
  const files = await smFetch<{ items: { file_id: string; content_type: string; metadata: Record<string, unknown> }[] }>("POST", "/filehandler/list", { owner_entity_id: id, type_id: QC_PHOTO_TYPE });
  const sorted = files.items.sort((a, b) => Number(a.metadata.position ?? 0) - Number(b.metadata.position ?? 0));
  const photos = await Promise.all(sorted.map(async (f) => `data:${f.content_type};base64,${(await smDownload(`/filehandler/${f.file_id}/download`)).bytes.toString("base64")}`));
  return { ...line, photos, po_state: poState };
}

function requireInProgress(poState: PoState) {
  if (poState !== "QC_IN_PROGRESS") throw new QcError(409, poState === "FETCHED" ? "Start QC on this purchase order first" : "QC on this purchase order is already finished");
}

async function savePhoto(lineId: string, dataUrl: string, position: number) {
  const match = /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(dataUrl);
  if (!match) throw new QcError(422, "The photo must be a JPEG or PNG image");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 8 * 1024 * 1024) throw new QcError(413, "The photo is too large");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: match[1] }), `upc-${position + 1}.${match[1] === "image/png" ? "png" : "jpg"}`);
  const query = new URLSearchParams({ type_id: QC_PHOTO_TYPE, owner_entity_id: lineId, owner_entity_type: LINE_TYPE, metadata: JSON.stringify({ position }) });
  await smUpload(`/filehandler/upload?${query}`, form);
}

/** Waits for the count matcher connector to move the line on from COUNT_CHECK. If the connector is slow or down, the app runs the same check itself. */
async function settle(lineId: string): Promise<LineState> {
  for (let i = 0; i < 16; i++) {
    const { state } = await ticketState(lineId);
    if (state !== "COUNT_CHECK") return state as LineState;
    await new Promise((r) => setTimeout(r, 500));
  }
  await matchLineCount(lineId);
  return (await ticketState(lineId)).state as LineState;
}

const validQty = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1_000_000;

/** Saves the count and a photo, then lets the State Machine check the count against the PO. */
export async function submitCount(lineId: string, input: { received_qty: unknown; photo: unknown }): Promise<QcLineDetail> {
  if (!validQty(input.received_qty)) throw new QcError(422, "Enter the number of units received");
  if (typeof input.photo !== "string") throw new QcError(422, "Add a photo of the goods");
  const { line, poState } = await loadLine(lineId);
  requireInProgress(poState);
  if (line.state !== "PENDING") throw new QcError(409, "This UPC has already been counted");
  await savePhoto(lineId, input.photo, line.photo_count);
  await putRecord(lineId, { received_qty: input.received_qty, photo_count: line.photo_count + 1 });
  await fire(lineId, "submit_count");
  await settle(lineId);
  return getLine(lineId);
}

export async function raiseException(lineId: string, input: { received_qty?: unknown; reason: unknown; note?: unknown; photo?: unknown }): Promise<QcLineDetail> {
  if (typeof input.reason !== "string" || !(input.reason in EXCEPTION_REASONS)) throw new QcError(422, "Choose a reason for the exception");
  const { line, poState } = await loadLine(lineId);
  requireInProgress(poState);
  const note = text(input.note).trim().slice(0, 500);
  const data: Record<string, unknown> = { exception_reason: input.reason.toLowerCase(), exception_note: note, exception_raised_at: new Date().toISOString() };
  if (typeof input.photo === "string") {
    await savePhoto(lineId, input.photo, line.photo_count);
    data.photo_count = line.photo_count + 1;
  }
  if (line.state === "COUNT_MISMATCH") {
    await putRecord(lineId, data);
    await fire(lineId, "raise_exception");
  } else if (line.state === "PENDING") {
    if (!validQty(input.received_qty)) throw new QcError(422, "Enter the number of units received");
    await putRecord(lineId, { ...data, received_qty: input.received_qty });
    await fire(lineId, "raise_exception_direct");
  } else {
    throw new QcError(409, "This UPC cannot take an exception now");
  }
  return getLine(lineId);
}

export async function recount(lineId: string): Promise<QcLineDetail> {
  const { line, poState } = await loadLine(lineId);
  requireInProgress(poState);
  if (line.state !== "COUNT_MISMATCH") throw new QcError(409, "Only a UPC with a count that does not match can be recounted");
  await fire(lineId, "recount");
  return getLine(lineId);
}

export async function resolveException(lineId: string, note: unknown): Promise<QcLineDetail> {
  const text_ = text(note).trim().slice(0, 500);
  if (!text_) throw new QcError(422, "Say what was done about the exception");
  const { line } = await loadLine(lineId);
  if (line.state !== "EXCEPTION") throw new QcError(409, "This UPC has no open exception");
  await putRecord(lineId, { resolution_note: text_, resolved_at: new Date().toISOString() });
  await fire(lineId, "resolve_exception");
  return getLine(lineId);
}

export async function completePo(poId: string, note: unknown): Promise<QcPoDetail> {
  const po = await getPo(poId);
  if (!po) throw new QcError(404, "Purchase order not found");
  requireInProgress(po.state);
  if (po.totals.pending > 0) throw new QcError(409, `${po.totals.pending} UPC${po.totals.pending === 1 ? " is" : "s are"} still to check`);
  // The State Machine checks the PO's own counters, so bring them up to date first.
  if (po.lines[0]) await rollUpPo(po.lines[0].id);
  const summary = text(note).trim().slice(0, 500);
  if (summary) await putRecord(poId, { qc_summary_note: summary });
  await fire(poId, po.totals.open_exceptions > 0 ? "complete_with_exceptions" : "complete_qc");
  return (await getPo(poId)) as QcPoDetail;
}

export async function listExceptions(): Promise<(QcLine & { po_state: PoState })[]> {
  const [lines, pos] = await Promise.all([allOf(machines.line(), LINE_TYPE, LINE_FIELDS), allOf(machines.po(), PO_TYPE, ["po_number"])]);
  const stateOf = new Map(pos.map((p) => [p.id, p.state as PoState]));
  return lines
    .map(lineFrom)
    .filter((l) => l.state === "EXCEPTION" || l.state === "EXCEPTION_RESOLVED")
    .map((l) => ({ ...l, po_state: stateOf.get(l.po_id) ?? "QC_IN_PROGRESS" }));
}
