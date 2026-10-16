import { smDownload, smFetch, smUpload } from "@/lib/sm/client";
import { addComment, createRecord, fire, getRecord, listComments, listRecords, putRecord, ticketState, type TicketListItem } from "@/lib/sm/records";
import { CHECKS, FLAG_REASONS, type CheckKey, type Flag, type FlagReason, type FlaggedUpc, type Pallet, type PalletStatus, type Shipment, type ShipmentDetail, type ShipmentState, type ShipmentTotals, type Upc, type UpcDetail, type UpcState } from "./dto";
import { matchCount, palletTotal } from "./match";
import { allOf, FLAG_TYPE, machines, matchUpcCount, NOTIFICATION_TYPE, PALLET_TYPE, QC_PHOTO_TYPE, recordsWhere, rollUpShipment, SHIPMENT_TYPE, UPC_TYPE } from "./sm";

/** Who is doing a step, so the comment it leaves says so. */
export interface Actor {
  id: string;
  name: string;
}

export class QcError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const SHIPMENT_FIELDS = ["po_number", "shipment_number", "vendor_name", "vendor_code", "dc_id", "dcqc_qc_ready", "started_at", "completed_at", "confirmation_number"];
const UPC_FIELDS = ["legacy_po_id", "po_number", "upc_code", "item_description", "style_number", "color_name", "size_label", "expected_units", "shipped_cases", "mdl", "units_per_bundle", "is_prepack", "retail_price", "dcqc_received_units", "dcqc_labels_complete", "flag_id", "dcqc_evidence_revision", "goods_photo_count", "dcqc_rework_reason"];

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const text = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const bool = (v: unknown) => v === true || v === "true";

const upcFrom = (i: TicketListItem): Upc => ({
  id: i.id,
  shipment_id: text(i.fields.legacy_po_id),
  po_number: text(i.fields.po_number),
  upc_code: text(i.fields.upc_code),
  description: text(i.fields.item_description),
  style_number: text(i.fields.style_number),
  color_name: text(i.fields.color_name),
  size_label: text(i.fields.size_label),
  expected_units: num(i.fields.expected_units) ?? 0,
  shipped_cases: num(i.fields.shipped_cases) ?? 0,
  mdl: num(i.fields.mdl) ?? 0,
  units_per_bundle: num(i.fields.units_per_bundle) ?? 1,
  is_prepack: bool(i.fields.is_prepack),
  retail_price: text(i.fields.retail_price),
  state: i.state as UpcState,
  received_units: num(i.fields.dcqc_received_units) ?? 0,
  labels_complete: bool(i.fields.dcqc_labels_complete),
  photo_count: num(i.fields.goods_photo_count) ?? 0,
  rework_reason: text(i.fields.dcqc_rework_reason),
  flag: null,
});

function totalsOf(upcs: Upc[]): ShipmentTotals {
  const count = (...states: UpcState[]) => upcs.filter((u) => states.includes(u.state)).length;
  return {
    upcs: upcs.length,
    units: upcs.reduce((s, u) => s + u.expected_units, 0),
    received: upcs.reduce((s, u) => s + u.received_units, 0),
    waiting: count("PENDING", "IN_PROGRESS"),
    approved: count("APPROVED"),
    on_hold: count("SUPERVISOR_HOLD"),
    wont_qc: count("WONT_QC"),
    blocking: count("PENDING", "IN_PROGRESS", "SUPERVISOR_HOLD"),
  };
}

const shipmentFrom = (i: { id: string; state: string; fields: Record<string, unknown> }, upcs: Upc[]): Shipment => ({
  id: i.id,
  po_number: text(i.fields.po_number),
  shipment_number: text(i.fields.shipment_number),
  vendor_name: text(i.fields.vendor_name),
  vendor_code: text(i.fields.vendor_code),
  dc_id: text(i.fields.dc_id),
  state: i.state as ShipmentState,
  qc_ready: upcs.length > 0 && totalsOf(upcs).blocking === 0,
  totals: totalsOf(upcs),
  started_at: text(i.fields.started_at) || null,
  completed_at: text(i.fields.completed_at) || null,
  confirmation_number: text(i.fields.confirmation_number),
});

const flagFrom = (r: { id: string; data: Record<string, unknown> }): Flag => ({
  id: r.id,
  reason: text(r.data.flag_code) as FlagReason,
  note: text(r.data.note),
  raised_at: text(r.data.raised_at),
  status: (text(r.data.status) || "OPEN") as Flag["status"],
  resolution_note: text(r.data.resolution_note),
  resolved_at: text(r.data.resolved_at) || null,
});

export async function listShipments(): Promise<Shipment[]> {
  const [shipments, upcs] = await Promise.all([allOf(machines.shipment(), SHIPMENT_TYPE, SHIPMENT_FIELDS), allOf(machines.upc(), UPC_TYPE, UPC_FIELDS)]);
  const byShipment = new Map<string, Upc[]>();
  for (const u of upcs.map(upcFrom)) byShipment.set(u.shipment_id, [...(byShipment.get(u.shipment_id) ?? []), u]);
  return shipments.map((s) => shipmentFrom(s, byShipment.get(s.id) ?? [])).sort((a, b) => a.po_number.localeCompare(b.po_number));
}

export async function getShipment(id: string): Promise<ShipmentDetail | null> {
  const record = await getRecord(id);
  if (!record || record.data.po_number === undefined || record.data.legacy_po_id === undefined) return null;
  const [state, items] = await Promise.all([ticketState(id).then((s) => s.state), allOf(machines.upc(), UPC_TYPE, UPC_FIELDS, { legacy_po_id: id })]);
  const upcs = items.map(upcFrom).sort((a, b) => a.description.localeCompare(b.description));
  return { ...shipmentFrom({ id, state, fields: record.data }, upcs), upcs };
}

async function loadShipmentState(id: string): Promise<ShipmentState> {
  return (await ticketState(id)).state as ShipmentState;
}

async function loadUpc(id: string): Promise<{ upc: Upc; data: Record<string, unknown> }> {
  const record = await getRecord(id);
  if (!record || record.data.upc_code === undefined) throw new QcError(404, "UPC not found");
  const state = (await ticketState(id)).state;
  return { upc: upcFrom({ id, state, fields: record.data, created_at: record.created_at, updated_at: record.updated_at }), data: record.data };
}

const requireShipmentInProgress = (state: ShipmentState) => {
  if (state !== "IN_PROGRESS") throw new QcError(409, state === "CREATED" ? "Start QC on this shipment first" : "QC on this shipment is already finished");
};

function palletFrom(r: { id: string; data: Record<string, unknown> }): Pallet {
  const d = r.data;
  const checks = Object.fromEntries(CHECKS.map(([key]) => [key, bool(d[key])])) as Record<CheckKey, boolean>;
  return {
    id: r.id,
    label: text(d.pallet_label),
    position: num(d.position) ?? 1,
    status: (text(d.dcqc_pallet_status) || "PENDING") as PalletStatus,
    expected_units: num(d.expected_units) ?? 0,
    checks,
    mdl_expected: num(d.mdl_expected) ?? 0,
    bundles_expected: num(d.bundles_expected) ?? 1,
    mdl_actual: num(d.mdl_actual),
    bundles_per_case: num(d.bundles_per_case),
    full_cases_count: num(d.full_cases_count),
    partial_units: num(d.dcqc_partial_units),
    label_photo_count: num(d.label_photo_count) ?? 0,
    total_units: num(d.dcqc_total_units) ?? 0,
  };
}

async function palletsOf(upcId: string): Promise<Pallet[]> {
  return (await recordsWhere(PALLET_TYPE, "upc_record_id", upcId)).map(palletFrom).sort((a, b) => a.position - b.position);
}

async function photosOf(upcId: string): Promise<UpcDetail["photos"]> {
  const files = await smFetch<{ items: { file_id: string; content_type: string; metadata: Record<string, unknown> }[] }>("POST", "/filehandler/list", { owner_entity_id: upcId, type_id: QC_PHOTO_TYPE });
  const sorted = files.items.sort((a, b) => Number(a.metadata.position ?? 0) - Number(b.metadata.position ?? 0));
  return Promise.all(
    sorted.map(async (f) => ({
      src: `data:${f.content_type};base64,${(await smDownload(`/filehandler/${f.file_id}/download`)).bytes.toString("base64")}`,
      kind: (f.metadata.kind === "label" ? "label" : "goods") as "goods" | "label",
      pallet_id: typeof f.metadata.pallet_id === "string" ? f.metadata.pallet_id : null,
    })),
  );
}

export async function getUpc(id: string): Promise<UpcDetail> {
  const { upc, data } = await loadUpc(id);
  const [pallets, photos, shipmentState, comments] = await Promise.all([palletsOf(id), photosOf(id), loadShipmentState(upc.shipment_id), listComments(id)]);
  const flagId = text(data.flag_id);
  const flagRecord = flagId ? await getRecord(flagId) : null;
  return {
    ...upc,
    flag: flagRecord ? flagFrom({ id: flagId, data: flagRecord.data }) : null,
    shipment_state: shipmentState,
    comments,
    pallets,
    photos,
    count: pallets.length && pallets.every((p) => p.status !== "PENDING") ? matchCount(upc.expected_units, upc.received_units) : null,
  };
}

// ------------------------------------------------------------------ shipments

export async function startShipments(ids: string[], user: Actor): Promise<void> {
  for (const id of ids) {
    if ((await loadShipmentState(id)) !== "CREATED") continue;
    await putRecord(id, { user_id: user.id, record_id: id });
    await fire(id, "qc_start");
    await addComment(id, `QC started by ${user.name}.`);
  }
}

export async function completeShipment(id: string, user: Actor): Promise<ShipmentDetail> {
  const shipment = await getShipment(id);
  if (!shipment) throw new QcError(404, "Shipment not found");
  requireShipmentInProgress(shipment.state);
  if (shipment.totals.blocking > 0) throw new QcError(409, `${shipment.totals.blocking} UPC${shipment.totals.blocking === 1 ? " is" : "s are"} not approved yet`);
  // The State Machine checks the shipment's own counters, so bring them up to date first.
  await rollUpShipment(shipment.upcs[0].id);
  await fire(id, "qc_submit");
  const t = shipment.totals;
  await addComment(id, `QC submitted by ${user.name}: ${t.approved} UPC${t.approved === 1 ? "" : "s"} approved${t.wont_qc ? `, ${t.wont_qc} skipped (won't QC)` : ""}, ${t.received} of ${t.units} units counted.`);
  return (await getShipment(id)) as ShipmentDetail;
}

export async function receipt(id: string, action: unknown, input: { user: Actor; confirmation_number?: unknown; note?: unknown }): Promise<ShipmentDetail> {
  const state = await loadShipmentState(id);
  if (action === "start" && state === "QC_COMPLETE") {
    await putRecord(id, { supervisor_user_id: input.user.id });
    await fire(id, "receipt_start");
    await addComment(id, `Receipt verification started by ${input.user.name}.`);
  } else if (action === "close" && state === "RECEIPT_IN_PROGRESS") {
    const confirmation = text(input.confirmation_number).trim().slice(0, 60);
    if (!confirmation) throw new QcError(422, "Enter the receipt confirmation number");
    await putRecord(id, { confirmation_number: confirmation });
    await fire(id, "receipt_close");
    await addComment(id, `Receipt closed by ${input.user.name}. Confirmation number ${confirmation}.`);
  } else if (action === "return" && (state === "QC_COMPLETE" || state === "RECEIPT_IN_PROGRESS")) {
    const returnNote = text(input.note).trim().slice(0, 500);
    await putRecord(id, { supervisor_user_id: input.user.id, return_note: returnNote });
    await fire(id, "receipt_return_to_associate");
    await addComment(id, `Returned to the associate by ${input.user.name}${returnNote ? `: ${returnNote}` : "."}`);
  } else {
    throw new QcError(409, "That receipt step is not available for this shipment now");
  }
  return (await getShipment(id)) as ShipmentDetail;
}

// ------------------------------------------------------------------ UPCs

const validCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1_000_000;

async function begin(upc: Upc, userId: string) {
  requireShipmentInProgress(await loadShipmentState(upc.shipment_id));
  if (upc.state === "PENDING") {
    await putRecord(upc.id, { user_id: userId });
    await fire(upc.id, "upc_start");
  } else if (upc.state !== "IN_PROGRESS") {
    throw new QcError(409, upc.state === "APPROVED" ? "This UPC is already approved" : "This UPC cannot be changed now");
  }
}

/** Saves one pallet's checks and counts, then updates the UPC's received units and label status from all its pallets. */
export async function savePallet(upcId: string, palletId: string, input: { checks?: Partial<Record<CheckKey, unknown>>; is_prepack?: unknown; mdl_actual?: unknown; bundles_per_case?: unknown; full_cases_count?: unknown; partial_units?: unknown }, userId: string): Promise<UpcDetail> {
  const { upc } = await loadUpc(upcId);
  await begin(upc, userId);
  const countsGiven = [input.mdl_actual, input.bundles_per_case, input.full_cases_count, input.partial_units].some((v) => v !== undefined);
  if (countsGiven && upc.photo_count < 1) throw new QcError(409, "Add at least one photo of the goods before you save a count.");
  const record = await getRecord(palletId);
  if (!record || record.data.upc_record_id !== upcId) throw new QcError(404, "Pallet not found");

  const patch: Record<string, unknown> = {};
  for (const [key] of CHECKS) if (input.checks && key in input.checks) patch[key] = Boolean(input.checks[key]);
  for (const [field, value] of [["mdl_actual", input.mdl_actual], ["bundles_per_case", input.bundles_per_case], ["full_cases_count", input.full_cases_count], ["dcqc_partial_units", input.partial_units]] as const) {
    if (value === undefined) continue;
    if (!validCount(value)) throw new QcError(422, "Counts must be whole numbers");
    patch[field] = value;
  }
  const merged = { ...record.data, ...patch };
  const labelsTicked = bool(merged.label_pallet_confirmed) || bool(merged.label_cases_confirmed);
  if (labelsTicked && (num(merged.label_photo_count) ?? 0) < 1) throw new QcError(409, "Add at least one photo of the labels on this pallet before you confirm them.");
  patch.dcqc_total_units = palletTotal({ mdl_actual: num(merged.mdl_actual), bundles_per_case: num(merged.bundles_per_case), full_cases_count: num(merged.full_cases_count), partial_units: num(merged.dcqc_partial_units) });
  const checked = CHECKS.every(([key]) => bool(merged[key]));
  const counted = num(merged.mdl_actual) !== null && num(merged.bundles_per_case) !== null && num(merged.full_cases_count) !== null;
  patch.dcqc_pallet_status = checked && counted ? "COMPLETE" : "IN_PROGRESS";
  await putRecord(palletId, patch);
  if (typeof input.is_prepack === "boolean") await putRecord(upcId, { is_prepack: input.is_prepack });

  // The State Machine's count matcher connector adds up the pallets when the UPC is re-checked. If it is slow or down, the app runs the same check.
  const expectedTotal = (await palletsOf(upcId)).reduce((sum, p) => sum + p.total_units, 0);
  await fire(upcId, "count_check");
  for (let i = 0; i < 16; i++) {
    if (num((await getRecord(upcId))?.data.dcqc_received_units) === expectedTotal) return getUpc(upcId);
    await new Promise((r) => setTimeout(r, 500));
  }
  await matchUpcCount(upcId);
  return getUpc(upcId);
}

/** Adds another pallet to a UPC, for goods that arrived on more pallets than the PO listed. */
export async function addPallet(upcId: string, userId: string): Promise<UpcDetail> {
  const { upc } = await loadUpc(upcId);
  await begin(upc, userId);
  const existing = await palletsOf(upcId);
  const position = existing.reduce((max, p) => Math.max(max, p.position), 0) + 1;
  const label = `PLT-${upc.upc_code.slice(-4)}-${position}`;
  const pallet = await createRecord(PALLET_TYPE, {
    identifier: label,
    legacy_pallet_id: `${upc.po_number}-${upc.upc_code}-${position}`,
    pallet_label: label,
    position,
    dcqc_pallet_status: "PENDING",
    mdl_expected: upc.mdl,
    bundles_expected: existing[0]?.bundles_expected ?? 1,
    expected_units: 0,
    dcqc_partial_units: 0,
    dcqc_total_units: 0,
    upc_record_id: upcId,
    shipment_record_id: upc.shipment_id,
    po_number: upc.po_number,
  });
  await putRecord(pallet.id, { record_id: pallet.id });
  return getUpc(upcId);
}

/** Saves a photo with the UPC. A goods photo shows the product; a label photo shows the labels on one pallet and is tied to it. */
export async function addPhoto(upcId: string, input: { photo: unknown; kind?: unknown; pallet_id?: unknown }, userId: string): Promise<UpcDetail> {
  const { upc, data } = await loadUpc(upcId);
  await begin(upc, userId);
  const kind = input.kind === "label" ? "label" : "goods";
  const palletId = typeof input.pallet_id === "string" ? input.pallet_id : null;
  const pallet = kind === "label" ? await getRecord(palletId ?? "") : null;
  if (kind === "label" && (!pallet || pallet.data.upc_record_id !== upcId)) throw new QcError(422, "Choose the pallet this label photo belongs to.");
  const match = typeof input.photo === "string" ? /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(input.photo) : null;
  if (!match) throw new QcError(422, "The photo must be a JPEG or PNG image");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 8 * 1024 * 1024) throw new QcError(413, "The photo is too large");
  const position = num(data.dcqc_evidence_revision) ?? 0;
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: match[1] }), `${kind}-${position + 1}.${match[1] === "image/png" ? "png" : "jpg"}`);
  const query = new URLSearchParams({ type_id: QC_PHOTO_TYPE, owner_entity_id: upcId, owner_entity_type: UPC_TYPE, metadata: JSON.stringify({ position, kind, pallet_id: palletId }) });
  const { file_id } = await smUpload<{ file_id: string }>(`/filehandler/upload?${query}`, form);
  await putRecord(upcId, {
    dcqc_evidence_revision: position + 1,
    ...(position === 0 ? { photo_ref: file_id } : {}),
    ...(kind === "goods" ? { goods_photo_count: (num(data.goods_photo_count) ?? 0) + 1 } : {}),
  });
  if (kind === "label" && pallet && palletId) await putRecord(palletId, { label_photo_count: (num(pallet.data.label_photo_count) ?? 0) + 1 });
  return getUpc(upcId);
}

/** Approves a UPC once its pallets are checked and counted, the count matches the PO and there is a photo. */
export async function approveUpc(upcId: string, user: Actor): Promise<UpcDetail> {
  const detail = await getUpc(upcId);
  requireShipmentInProgress(detail.shipment_state);
  if (detail.state !== "IN_PROGRESS") throw new QcError(409, detail.state === "PENDING" ? "Check at least one pallet first" : "This UPC cannot be approved now");
  if (!detail.pallets.length || detail.pallets.some((p) => p.status !== "COMPLETE")) throw new QcError(409, "Finish the checks and count on every pallet first.");
  if (!detail.labels_complete) throw new QcError(409, "Tick both label boxes (pallet label and case labels) first.");
  const result = matchCount(detail.expected_units, detail.received_units);
  if (result.result !== "MATCH") throw new QcError(409, `The count does not match the PO (${result.result === "SHORT" ? "short" : "over"} by ${result.diff}). Flag the UPC instead.`);
  if (detail.photo_count < 1) throw new QcError(409, "Add at least one photo of the goods before approving this UPC.");
  const noLabelPhoto = detail.pallets.find((p) => p.label_photo_count < 1);
  if (noLabelPhoto) throw new QcError(409, `Add a photo of the labels on pallet ${noLabelPhoto.position} before approving this UPC.`);
  await putRecord(upcId, { user_id: user.id });
  await fire(upcId, "upc_approve");
  await addComment(upcId, `Approved by ${user.name}: ${detail.received_units} of ${detail.expected_units} units counted across ${detail.pallets.length} pallet${detail.pallets.length === 1 ? "" : "s"}.`);
  return getUpc(upcId);
}

/** Flags a UPC for the supervisor, which puts it on hold. */
export async function flagUpc(upcId: string, input: { reason: unknown; note?: unknown }, user: Actor): Promise<UpcDetail> {
  if (typeof input.reason !== "string" || !(input.reason in FLAG_REASONS)) throw new QcError(422, "Choose a reason for the flag");
  const { upc } = await loadUpc(upcId);
  requireShipmentInProgress(await loadShipmentState(upc.shipment_id));
  if (upc.state === "PENDING") await begin(upc, user.id);
  else if (upc.state !== "IN_PROGRESS") throw new QcError(409, "This UPC cannot be flagged now");
  const flagNote = text(input.note).trim().slice(0, 500);
  const flag = await createRecord(FLAG_TYPE, {
    identifier: `FLAG-${upc.upc_code.slice(-4)}-${Date.now().toString(36)}`,
    upc_record_id: upcId,
    po_number: upc.po_number,
    flag_code: input.reason,
    note: flagNote,
    raised_by: user.id,
    raised_at: new Date().toISOString(),
    status: "OPEN",
  });
  await putRecord(upcId, { flag_id: flag.id, dcqc_active_exception_id: flag.id, dcqc_exception_status: "OPEN" });
  await fire(upcId, "upc_flag");
  await addComment(upcId, `Flagged for the supervisor by ${user.name}: ${FLAG_REASONS[input.reason as FlagReason]}${flagNote ? `. ${flagNote}` : "."}`);
  return getUpc(upcId);
}

const OUTCOMES = {
  approve: { trigger: "dcqc_supervisor_approve", status: "RESOLVED" },
  return: { trigger: "upc_return_to_progress", status: "RESOLVED_RETURN_TO_QUEUE" },
  wont_qc: { trigger: "upc_wont_qc", status: "RESOLVED_WONT_QC" },
} as const;

/** A supervisor's answer to a flag: approve the UPC, send it back to the associate, or skip it. */
export async function resolveFlag(upcId: string, action: unknown, note: unknown, user: Actor): Promise<UpcDetail> {
  if (typeof action !== "string" || !(action in OUTCOMES)) throw new QcError(422, "Choose what to do with the UPC");
  const outcome = OUTCOMES[action as keyof typeof OUTCOMES];
  const { upc, data } = await loadUpc(upcId);
  if (upc.state !== "SUPERVISOR_HOLD") throw new QcError(409, "This UPC is not on hold");
  const flagId = text(data.flag_id);
  const answer = text(note).trim().slice(0, 500);
  await putRecord(upcId, { resolved_by_user_id: user.id, dcqc_exception_status: outcome.status });
  await fire(upcId, outcome.trigger);
  if (flagId) await putRecord(flagId, { status: outcome.status, resolution_note: answer, resolved_at: new Date().toISOString(), resolved_by: user.id });
  const verb = action === "approve" ? "approved the UPC" : action === "return" ? "sent the UPC back to the associate" : "skipped the UPC (won't QC)";
  await addComment(upcId, `Supervisor ${user.name} ${verb}${answer ? `: ${answer}` : "."}`);
  return getUpc(upcId);
}

/** A supervisor sends an approved UPC back for rework. */
export async function reopenUpc(upcId: string, reason: unknown, user: Actor): Promise<UpcDetail> {
  const why = text(reason).trim().slice(0, 500);
  if (!why) throw new QcError(422, "Say why the UPC needs rework");
  const { upc } = await loadUpc(upcId);
  requireShipmentInProgress(await loadShipmentState(upc.shipment_id));
  if (upc.state !== "APPROVED") throw new QcError(409, "Only an approved UPC can be reopened");
  await putRecord(upcId, { supervisor_user_id: user.id, dcqc_rework_reason: why });
  await fire(upcId, "dcqc_reopen");
  await addComment(upcId, `Sent back for rework by ${user.name}: ${why}`);
  return getUpc(upcId);
}

export interface QcNotification {
  id: string;
  event: string;
  recipient: string;
  message: string;
  po_number: string;
  created_at: string;
}

/** The latest messages the connectors sent. */
export async function listNotifications(): Promise<QcNotification[]> {
  return (await listRecords(NOTIFICATION_TYPE, { limit: 100 }))
    .map((r) => ({ id: r.id, event: text(r.data.event), recipient: text(r.data.recipient), message: text(r.data.message), po_number: text(r.data.po_number), created_at: text(r.data.created_at) }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 20);
}

/** UPCs that are on hold, or whose flag was answered. */
export async function listFlagged(): Promise<FlaggedUpc[]> {
  const [shipments, items] = await Promise.all([allOf(machines.shipment(), SHIPMENT_TYPE, ["po_number"]), allOf(machines.upc(), UPC_TYPE, UPC_FIELDS)]);
  const stateOf = new Map(shipments.map((s) => [s.id, s.state as ShipmentState]));
  const flagged = items.filter((i) => text(i.fields.flag_id));
  const out: FlaggedUpc[] = [];
  for (const i of flagged) {
    const upc = upcFrom(i);
    const record = await getRecord(text(i.fields.flag_id));
    out.push({ ...upc, flag: record ? flagFrom({ id: record.id, data: record.data }) : null, shipment_state: stateOf.get(upc.shipment_id) ?? "IN_PROGRESS" });
  }
  return out;
}
