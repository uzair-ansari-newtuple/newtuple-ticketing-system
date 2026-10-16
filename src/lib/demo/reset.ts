import { SEED_SHIPMENTS } from "@/data/qc";
import { allOf, fetchShipments, FLAG_TYPE, machines, NOTIFICATION_TYPE, PALLET_TYPE, QC_PHOTO_TYPE, SHIPMENT_TYPE, shipmentSeed, UPC_TYPE, upcSeed } from "@/lib/qc/sm";
import { smFetch, smEntityType, smMachine } from "@/lib/sm/client";
import { addComment, deleteRecord, DEMO_RESET_MARKER, fire, getRecord, listRecords, PHOTO_FILE_TYPE, putRecord } from "@/lib/sm/records";

/** States a workflow cannot leave, so a record in one of them is deleted and made again instead of reset. */
const TERMINAL = { shipment: ["CLOSED"], upc: ["WONT_QC"], ticket: ["RESOLVED"] } as const;

/** What the ticket workflow produces after the store has captured the photos. A reset empties these and keeps the capture. */
const TICKET_RESULT_FIELDS = [
  "ocr_text", "brand", "department", "extracted_metadata", "gating_tier", "candidate_count", "edw_candidates", "selected_candidate", "item_age",
  "disposition", "new_tag_added", "closed_at", "resolver_id", "resolver_name", "resolver_lane_state", "resolver_decision", "resolver_reason_codes",
  "resolver_comment", "escalation_note", "event_log",
];

export interface WorkflowCounts {
  name: string;
  total: number;
  byState: Record<string, number>;
}

export interface DemoStatus {
  workflows: WorkflowCounts[];
}

export interface ResetSummary {
  shipments: { reset: number; recreated: number };
  upcs: { reset: number; recreated: number };
  tickets: { reset: number; deleted: number };
  cleared: { pallets: number; flags: number; notifications: number; photos: number };
  loaded: string[];
  warnings: string[];
}

const group = (items: { state: string }[]): Record<string, number> => items.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.state]: (acc[i.state] ?? 0) + 1 }), {});

export async function demoStatus(): Promise<DemoStatus> {
  const [shipments, upcs, tickets] = await Promise.all([
    allOf(machines.shipment(), SHIPMENT_TYPE, ["po_number"]),
    allOf(machines.upc(), UPC_TYPE, ["po_number"]),
    allOf(smMachine(), smEntityType(), ["identifier"]),
  ]);
  return {
    workflows: [
      { name: "DCQC Shipment QC", total: shipments.length, byState: group(shipments) },
      { name: "DCQC UPC QC", total: upcs.length, byState: group(upcs) },
      { name: "ResolverIQ Incident Lifecycle", total: tickets.length, byState: group(tickets) },
    ],
  };
}

/** Runs `work` over the items a few at a time. */
async function inBatches<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(work));
}

async function schemaFields(machine: string): Promise<{ field: string; default?: unknown; nullable?: boolean }[]> {
  const active = await smFetch<{ definition: { entity_schema: { fields: { field: string; default?: unknown; nullable?: boolean }[] } } }>("GET", `/workflow-state-machines/${machine}/active`);
  return active.definition.entity_schema.fields;
}

/** Saves the values; if the State Machine refuses the lot, saves them one by one and reports the ones it refused. */
async function save(id: string, data: Record<string, unknown>, warnings: string[]): Promise<void> {
  try {
    await putRecord(id, data);
    return;
  } catch {
    // fall through to one field at a time
  }
  for (const [field, value] of Object.entries(data)) {
    try {
      await putRecord(id, { [field]: value });
    } catch {
      warnings.push(`Could not clear ${field} on ${id}`);
    }
  }
}

/** Empty values for every field a record has been given beyond its starting data: the schema default if there is one, otherwise nothing, zero or false to match what is stored. */
async function blanked(id: string, schema: { field: string; default?: unknown }[], keep: string[], only?: string[]): Promise<Record<string, unknown>> {
  const data = (await getRecord(id))?.data ?? {};
  const empty = (key: string): unknown => {
    const fallback = schema.find((f) => f.field === key)?.default;
    if (fallback !== undefined && fallback !== null) return fallback;
    const value = data[key];
    return typeof value === "number" ? 0 : typeof value === "boolean" ? false : null;
  };
  return Object.fromEntries(Object.keys(data).filter((k) => !keep.includes(k) && (!only || only.includes(k))).map((k) => [k, empty(k)]));
}

async function deleteQcPhotos(upcId: string): Promise<number> {
  const files = await smFetch<{ items: { file_id: string }[] }>("POST", "/filehandler/list", { owner_entity_id: upcId, type_id: QC_PHOTO_TYPE });
  for (const f of files.items) await smFetch("DELETE", `/filehandler/${f.file_id}`);
  return files.items.length;
}

async function deleteAll(type: string): Promise<number> {
  let deleted = 0;
  for (;;) {
    const page = await listRecords(type, { limit: 100 });
    if (!page.length) return deleted;
    await inBatches(page, 5, async (r) => {
      await deleteRecord(r.id);
      deleted++;
    });
  }
}

/**
 * Puts the demo back at the start. Records still in the middle of a check go back to their first state in place; records in a state the
 * workflow cannot leave are deleted and made again from the sample data. Pallets, flags, notifications and the photos on UPCs are cleared.
 */
export async function resetDemo(): Promise<ResetSummary> {
  const summary: ResetSummary = {
    shipments: { reset: 0, recreated: 0 },
    upcs: { reset: 0, recreated: 0 },
    tickets: { reset: 0, deleted: 0 },
    cleared: { pallets: 0, flags: 0, notifications: 0, photos: 0 },
    loaded: [],
    warnings: [],
  };

  // 1. Records in a state the workflow cannot leave are deleted first, so everything made again below is made fresh.
  const [firstShipments, firstUpcs] = await Promise.all([
    allOf(machines.shipment(), SHIPMENT_TYPE, ["po_number"]),
    allOf(machines.upc(), UPC_TYPE, ["po_number", "upc_code"]),
  ]);
  await inBatches(firstUpcs.filter((u) => (TERMINAL.upc as readonly string[]).includes(u.state)), 4, async (u) => {
    summary.cleared.photos += await deleteQcPhotos(u.id);
    await deleteRecord(u.id);
    summary.upcs.recreated++;
  });
  await inBatches(firstShipments.filter((s) => (TERMINAL.shipment as readonly string[]).includes(s.state)), 4, async (s) => {
    await deleteRecord(s.id);
    summary.shipments.recreated++;
  });

  // 2. Pallets, flags and notifications are made again from the sample data, so they are all deleted.
  summary.cleared.pallets = await deleteAll(PALLET_TYPE);
  summary.cleared.flags = await deleteAll(FLAG_TYPE);
  summary.cleared.notifications = await deleteAll(NOTIFICATION_TYPE);

  // 3. Anything missing from the sample data (deleted shipments and UPCs, and all the pallets) is made again.
  summary.loaded = (await fetchShipments()).created;

  // 4. What is left, in whatever state it reached, goes back to the start in place.
  const [shipments, upcs] = await Promise.all([
    allOf(machines.shipment(), SHIPMENT_TYPE, ["po_number"]),
    allOf(machines.upc(), UPC_TYPE, ["po_number", "upc_code"]),
  ]);
  const shipmentIds = new Map(shipments.map((s) => [String(s.fields.po_number), s.id]));
  const [shipmentSchema, upcSchema] = await Promise.all([schemaFields(machines.shipment()), schemaFields(machines.upc())]);
  await inBatches(upcs, 4, async (u) => {
    summary.cleared.photos += await deleteQcPhotos(u.id);
    const seedShipment = SEED_SHIPMENTS.find((s) => s.po_number === u.fields.po_number);
    const seedUpc = seedShipment?.upcs.find((x) => x.sku === u.fields.upc_code);
    const shipmentId = shipmentIds.get(String(u.fields.po_number));
    if (!seedShipment || !seedUpc || !shipmentId) {
      summary.warnings.push(`UPC ${String(u.fields.upc_code)} is not part of the sample data, so it was left as it is`);
      return;
    }
    if (u.state !== "PENDING") await fire(u.id, "demo_reset");
    const seed = upcSeed(seedShipment, shipmentId, seedUpc);
    await save(u.id, { ...(await blanked(u.id, upcSchema, [...Object.keys(seed), "record_id", "dcqc_record_id"])), ...seed }, summary.warnings);
    await addComment(u.id, DEMO_RESET_MARKER);
    summary.upcs.reset++;
  });

  await inBatches(shipments, 4, async (s) => {
    const seedShipment = SEED_SHIPMENTS.find((x) => x.po_number === s.fields.po_number);
    if (!seedShipment) {
      summary.warnings.push(`Shipment ${String(s.fields.po_number)} is not part of the sample data, so it was left as it is`);
      return;
    }
    if (s.state !== "CREATED") await fire(s.id, "demo_reset");
    const seed = shipmentSeed(seedShipment);
    await save(s.id, { ...(await blanked(s.id, shipmentSchema, [...Object.keys(seed), "record_id", "dcqc_record_id"])), ...seed }, summary.warnings);
    await addComment(s.id, DEMO_RESET_MARKER);
    summary.shipments.reset++;
  });

  // Tickets go back to Captured. What the store captured stays, what the workflow produced is emptied.
  const tickets = await allOf(smMachine(), smEntityType(), ["identifier"]);
  await inBatches(tickets, 4, async (t) => {
    if ((TERMINAL.ticket as readonly string[]).includes(t.state)) {
      const files = await smFetch<{ items: { file_id: string }[] }>("POST", "/filehandler/list", { owner_entity_id: t.id, type_id: PHOTO_FILE_TYPE });
      for (const f of files.items) await smFetch("DELETE", `/filehandler/${f.file_id}`);
      await deleteRecord(t.id);
      summary.tickets.deleted++;
      return;
    }
    if (t.state !== "CAPTURED") await fire(t.id, "demo_reset");
    await save(t.id, await blanked(t.id, [], [], TICKET_RESULT_FIELDS), summary.warnings);
    await addComment(t.id, DEMO_RESET_MARKER);
    summary.tickets.reset++;
  });

  return summary;
}
