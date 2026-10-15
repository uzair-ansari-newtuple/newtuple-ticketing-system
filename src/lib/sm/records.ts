import { randomUUID } from "node:crypto";
import { SmError, smDownload, smEntityType, smFetch, smMachine, smUpload } from "@/lib/sm/client";

export const PHOTO_FILE_TYPE = "incident_photo";
export const QUALITY_ENTITY_TYPE = "quality_check";
const LIST_PAGE = 200;

export interface SmRecord {
  id: string;
  data: Record<string, unknown>;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
}

interface RawRecord {
  entity_id: string;
  data: Record<string, unknown>;
  assignee_id?: string | null;
  created_at: string;
  updated_at: string;
}

const toRecord = (r: RawRecord): SmRecord => ({ id: r.entity_id, data: r.data ?? {}, assignee_id: r.assignee_id ?? null, created_at: r.created_at, updated_at: r.updated_at });
const typeIds = new Map<string, string>();
const UUID = /^[0-9a-f-]{36}$/i;

async function entityTypeId(name: string): Promise<string> {
  const known = typeIds.get(name);
  if (known) return known;
  const { entity_type_id } = await smFetch<{ entity_type_id: string }>("GET", `/entity-types/${name}`);
  typeIds.set(name, entity_type_id);
  return entity_type_id;
}

const notFound = (err: unknown) => err instanceof SmError && (err.status === 404 || err.status === 422 || err.status === 400);

/** Creates a record. The State Machine picks the id, and fills in any auto-number field. */
export async function createRecord(typeName: string, data: Record<string, unknown>): Promise<SmRecord> {
  return toRecord(await smFetch<RawRecord>("POST", "/entity-records", { entity_type_id: await entityTypeId(typeName), data }));
}

/** Lists plain records of a type (one with no workflow). `search` matches anywhere in a record, so callers should still compare the field they care about. */
export async function listRecords(typeName: string, opts: { search?: string; limit?: number } = {}): Promise<SmRecord[]> {
  const query = new URLSearchParams({ entity_type_name: typeName, limit: String(Math.min(opts.limit ?? 100, 100)) });
  if (opts.search) query.set("search", opts.search);
  const res = await smFetch<{ items: RawRecord[] }>("GET", `/entity-records?${query}`);
  return res.items.map(toRecord);
}

export async function getRecord(id: string): Promise<SmRecord | null> {
  if (!UUID.test(id)) return null;
  try {
    return toRecord(await smFetch<RawRecord>("GET", `/entity-records/${id}`));
  } catch (err) {
    if (notFound(err)) return null;
    throw err;
  }
}

/** Merges the given fields into the record. Fields not mentioned are left as they are. */
export async function putRecord(id: string, data: Record<string, unknown>): Promise<SmRecord> {
  return toRecord(await smFetch<RawRecord>("PUT", `/entity-records/${id}`, { data }));
}

export async function deleteRecord(id: string): Promise<void> {
  await smFetch("DELETE", `/entity-records/${id}`);
}

export async function enroll(id: string, machine = smMachine()): Promise<void> {
  await smFetch("POST", `/workflow-state-machines/${machine}/enrollments`, { entity_id: id });
}

export async function ticketState(id: string): Promise<{ state: string; triggers: string[] }> {
  const r = await smFetch<{ current_state: string; available_transitions: { trigger: string; allowed: boolean }[] }>("GET", `/entities/${id}/transitions/available`);
  return { state: r.current_state, triggers: r.available_transitions.filter((t) => t.allowed).map((t) => t.trigger) };
}

/** Fires a workflow trigger. The State Machine refuses it when the ticket is in the wrong state or required data is missing. */
export async function fire(id: string, trigger: string): Promise<string> {
  const r = await smFetch<{ to_state: string }>("POST", `/entities/${id}/transitions`, { entity_id: id, trigger, idempotency_key: randomUUID(), inputs: {} });
  return r.to_state;
}

export async function setAssignee(id: string, userId: string | null): Promise<void> {
  await smFetch("PUT", `/entity-records/${id}/assignee`, userId ? { assignee_id: userId } : {});
}

export interface TicketListItem {
  id: string;
  state: string;
  fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Lists tickets with only the fields asked for. Equality filters on ticket fields are applied by the State Machine. */
export async function listTickets(opts: { fields: string[]; filters?: Record<string, string>; limit?: number; offset?: number; machine?: string; entityType?: string }): Promise<{ items: TicketListItem[]; total: number }> {
  const query = new URLSearchParams({
    machine_name: opts.machine ?? smMachine(),
    entity_type_name: opts.entityType ?? smEntityType(),
    offset: String(opts.offset ?? 0),
    fields: opts.fields.join(","),
    sort_by: "created",
    sort_dir: "desc",
    include: "total_count",
    limit: String(Math.min(opts.limit ?? LIST_PAGE, LIST_PAGE)),
  });
  if (opts.filters) query.set("field_filters", JSON.stringify(opts.filters));
  const res = await smFetch<{ items: { entity_id: string; current_state: string; summary_fields: Record<string, unknown>; entity_created_at: string; entity_updated_at: string }[]; total_count: number }>(
    "GET",
    `/workflow-enrollments?${query}`,
  );
  return {
    items: res.items.map((i) => ({ id: i.entity_id, state: i.current_state, fields: i.summary_fields, created_at: i.entity_created_at, updated_at: i.entity_updated_at })),
    total: res.total_count,
  };
}

export interface PhotoFile {
  file_id: string;
  filename: string;
  content_type: string;
  metadata: Record<string, unknown>;
}

export async function uploadPhoto(ticketId: string, photo: { bytes: Buffer; mime: string; filename: string; metadata: Record<string, unknown> }): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(photo.bytes)], { type: photo.mime }), photo.filename);
  const query = new URLSearchParams({ type_id: PHOTO_FILE_TYPE, owner_entity_id: ticketId, owner_entity_type: smEntityType(), metadata: JSON.stringify(photo.metadata) });
  const { file_id } = await smUpload<{ file_id: string }>(`/filehandler/upload?${query}`, form);
  return file_id;
}

/** The photos of a ticket in the order they were taken. */
export async function listPhotos(ticketId: string): Promise<PhotoFile[]> {
  const res = await smFetch<{ items: PhotoFile[] }>("POST", "/filehandler/list", { owner_entity_id: ticketId, type_id: PHOTO_FILE_TYPE });
  return res.items.sort((a, b) => Number(a.metadata.position ?? 0) - Number(b.metadata.position ?? 0));
}

export async function downloadPhoto(fileId: string): Promise<Buffer> {
  return (await smDownload(`/filehandler/${fileId}/download`)).bytes;
}
