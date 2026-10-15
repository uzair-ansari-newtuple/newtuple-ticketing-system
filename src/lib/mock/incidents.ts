import { productImageUrl } from "@/data/catalog";
import { fire, getRecord, listTickets, putRecord, setAssignee, type SmRecord, type TicketListItem } from "@/lib/sm/records";
import type { AppUser } from "@/lib/sm/identity";
import type {
  Candidate,
  ClientAnalysis,
  Disposition,
  Escalation,
  Gating,
  IncidentDetail,
  IncidentEvent,
  IncidentState,
  IncidentSummary,
  ItemAge,
  MetadataExtraction,
  NormalizedMetadata,
  PrintJob,
  ResolverState,
} from "@/lib/types";

/** A ticket as the app sees it. It is stored as one record in the State Machine, with complex parts kept as JSON text. */
export interface IncidentRow {
  id: string;
  display: string;
  number: number;
  store_id: string;
  capture_profile_id: string;
  current_state: IncidentState;
  gating: Gating | null;
  gating_reason: string | null;
  candidates: Candidate[];
  selected: Candidate | null;
  item_age: ItemAge | null;
  escalation: Escalation | null;
  resolver: ResolverState | null;
  extraction: Partial<MetadataExtraction> | null;
  analysis: ClientAnalysis;
  thumb: string | null;
  image_count: number;
  unread_for_store: boolean;
  disposition: Disposition | null;
  new_tag_added: boolean;
  missing_price_tag_count: number;
  print_jobs: PrintJob[];
  events: IncidentEvent[];
  pipeline: Record<string, string>;
  created_at: Date;
  updated_at: Date;
}

export type RowPatch = Partial<Pick<IncidentRow, "current_state" | "gating" | "gating_reason" | "candidates" | "selected" | "item_age" | "escalation" | "resolver" | "extraction" | "analysis" | "unread_for_store" | "disposition" | "new_tag_added" | "missing_price_tag_count" | "print_jobs" | "pipeline">>;

export const EMPTY_ANALYSIS: ClientAnalysis = { model: "pending", match: null, top_matches: [], match_threshold: 0, classification: null, ocr: null, error: null };

/** The State Machine's Disposition picklist uses DISCARD_TRASH where the app says DISCARD. */
const DISPOSITION_TO_SM: Record<Disposition, string> = { DISCARD: "DISCARD_TRASH", RETURN_TO_VENDOR: "RETURN_TO_VENDOR", DONATE: "DONATE" };
const DISPOSITION_FROM_SM: Record<string, Disposition> = { DISCARD_TRASH: "DISCARD", DISCARD: "DISCARD", RETURN_TO_VENDOR: "RETURN_TO_VENDOR", DONATE: "DONATE" };

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
const asBool = (v: unknown) => v === true || v === "true";
const asText = (v: unknown) => (v === null || v === undefined ? "" : String(v));

const withoutThumb = <T extends { thumb: string | null }>(c: T): T => ({ ...c, thumb: null });
const showThumb = (c: Candidate): Candidate => ({ ...c, thumb: c.thumb ?? (c.sku ? productImageUrl(c.sku) : null) });

/** Reads a ticket from State Machine fields. Works on a whole record or on the few fields a list asks for. */
export function rowFromData(id: string, data: Record<string, unknown>, createdAt: string, updatedAt: string): IncidentRow {
  const display = asText(data.incident_number) || asText(data.identifier);
  const selected = parseJson<Candidate | null>(data.selected, null);
  const analysis = parseJson<ClientAnalysis>(data.analysis, EMPTY_ANALYSIS);
  const extraction = parseJson<Partial<MetadataExtraction> | null>(data.extraction, null);
  const meta = parseJson<NormalizedMetadata | null>(data.extracted_metadata, null);
  return {
    id,
    display,
    number: Number(display.replace(/\D/g, "")) || 0,
    store_id: asText(data.store_id),
    capture_profile_id: asText(data.capture_profile_id) || "PHOTO_LANE",
    current_state: (asText(data.app_state) || "METADATA_PENDING") as IncidentState,
    gating: (asText(data.gating_tier) || null) as Gating | null,
    gating_reason: asText(data.gating_reason) || null,
    candidates: parseJson<Candidate[]>(data.candidates, []).map(showThumb),
    selected: selected ? showThumb(selected) : null,
    item_age: (asText(data.item_age) || null) as ItemAge | null,
    escalation: parseJson<Escalation | null>(data.escalation, null),
    resolver: parseJson<ResolverState | null>(data.resolver, null),
    extraction: extraction ?? (meta ? { normalized_metadata: meta } : null),
    analysis,
    thumb: asText(data.thumb) || null,
    image_count: Number(data.image_count ?? 0),
    unread_for_store: asBool(data.unread_for_store),
    disposition: DISPOSITION_FROM_SM[asText(data.disposition)] ?? null,
    new_tag_added: asBool(data.new_tag_added),
    missing_price_tag_count: Number(data.missing_price_tag_count ?? 1) || 1,
    print_jobs: parseJson<PrintJob[]>(data.print_jobs, []),
    events: parseJson<IncidentEvent[]>(data.event_log, []),
    pipeline: parseJson<Record<string, string>>(data.pipeline, {}),
    created_at: new Date(createdAt),
    updated_at: new Date(updatedAt),
  };
}

const rowFromRecord = (r: SmRecord) => rowFromData(r.id, r.data, r.created_at, r.updated_at);

/** Turns a change to a ticket into State Machine fields. */
function encode(patch: RowPatch): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  const has = (k: keyof RowPatch) => k in patch;
  if (has("current_state")) d.app_state = patch.current_state;
  if (has("gating")) d.gating_tier = patch.gating ?? "";
  if (has("gating_reason")) d.gating_reason = patch.gating_reason ?? "";
  if (has("candidates")) {
    const list = patch.candidates ?? [];
    d.candidates = JSON.stringify(list.map(withoutThumb));
    d.edw_candidates = JSON.stringify(list.map((c) => ({ sku: c.sku, score: c.score, evidence: c.evidence })));
    d.candidate_count = list.length;
  }
  if (has("selected")) {
    d.selected = patch.selected ? JSON.stringify(withoutThumb(patch.selected)) : "";
    d.selected_candidate = patch.selected?.sku ?? "";
  }
  if (has("item_age")) d.item_age = patch.item_age ?? "";
  if (has("escalation")) d.escalation = patch.escalation ? JSON.stringify(patch.escalation) : "";
  if (has("resolver")) d.resolver = patch.resolver ? JSON.stringify(patch.resolver) : "";
  if (has("extraction")) {
    d.extraction = patch.extraction ? JSON.stringify(patch.extraction) : "";
    d.extracted_metadata = patch.extraction?.normalized_metadata ? JSON.stringify(patch.extraction.normalized_metadata) : "";
  }
  if (has("analysis") && patch.analysis) {
    const a = patch.analysis;
    d.analysis = JSON.stringify({ ...a, match: a.match ? withoutThumb(a.match) : null, top_matches: a.top_matches.map(withoutThumb) });
  }
  if (has("unread_for_store")) d.unread_for_store = String(Boolean(patch.unread_for_store));
  if (has("disposition")) d.disposition = patch.disposition ? DISPOSITION_TO_SM[patch.disposition] : "";
  if (has("new_tag_added")) d.new_tag_added = Boolean(patch.new_tag_added);
  if (has("missing_price_tag_count")) d.missing_price_tag_count = patch.missing_price_tag_count;
  if (has("print_jobs")) d.print_jobs = JSON.stringify(patch.print_jobs ?? []);
  if (has("pipeline")) d.pipeline = JSON.stringify(patch.pipeline ?? {});
  return d;
}

export interface SaveOptions {
  /** Extra State Machine fields shown on its board, such as the resolver's name. */
  board?: Record<string, unknown>;
  /** An entry for the ticket's activity log. */
  event?: { type: string; actor: string; detail?: Record<string, unknown> };
  /** A workflow trigger to fire after the fields are saved. */
  trigger?: string;
  /** Who the State Machine should show as the ticket's assignee. */
  assignee?: string | null;
}

/** Saves a change to a ticket. Fields are written first and the trigger fires second, because the State Machine checks a transition against saved data. */
export async function saveRow(row: IncidentRow, patch: RowPatch, options: SaveOptions = {}): Promise<void> {
  const data: Record<string, unknown> = { ...encode(patch), ...(options.board ?? {}) };
  if (options.event) {
    const entry: IncidentEvent = { type: options.event.type, actor: options.event.actor, detail: options.event.detail ?? {}, created_at: new Date().toISOString() };
    row.events = [...row.events, entry];
    data.event_log = JSON.stringify(row.events);
  }
  Object.assign(row, patch);
  if (Object.keys(data).length) await putRecord(row.id, data);
  if (options.assignee !== undefined) await setAssignee(row.id, options.assignee);
  if (options.trigger) await fire(row.id, options.trigger);
}

export function summaryText(row: IncidentRow): string {
  const meta = row.selected?.metadata ?? row.extraction?.normalized_metadata;
  if (!meta) return row.current_state === "FAILED" ? "Analysis failed" : "Analyzing";
  return meta.ProductName ?? [meta.Brand, meta.ClassName].filter(Boolean).join(" · ") ?? "Item";
}

function titleOf(row: IncidentRow): string {
  const meta = row.selected?.metadata ?? row.resolver?.recommended ?? row.extraction?.normalized_metadata;
  return meta?.Brand ?? meta?.ProductName ?? "Unbranded";
}

export function toSummary(row: IncidentRow): IncidentSummary {
  const meta = row.selected?.metadata ?? row.extraction?.normalized_metadata;
  return {
    id: row.id,
    number_display: row.display,
    state: row.current_state,
    gating: row.gating,
    thumb: row.thumb,
    summary: summaryText(row) || "Item",
    unread: row.unread_for_store,
    resolver_status: row.resolver?.status ?? null,
    resolver_decision: row.resolver?.decision ?? null,
    priority: row.item_age === "NEW_FREIGHT" ? "HIGH" : row.item_age === "OLD_MERCHANDISE" ? "LOW" : null,
    title: titleOf(row),
    department: meta?.DepartmentName ?? null,
    short_number: row.number,
    disposition: row.disposition,
    new_tag_added: row.new_tag_added,
    missing_price_tag_count: row.missing_price_tag_count,
    store_id: row.store_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/** Stores see their own tickets. Resolvers only see tickets that were escalated. */
const canSee = (row: IncidentRow, user: AppUser) => (user.role === "store" ? row.store_id === user.store_id : row.escalation !== null);

/** A ticket by id, with no check on who is asking. Used by the connectors, which are not signed in as a user. */
export async function getRow(id: string): Promise<IncidentRow | null> {
  const record = await getRecord(id);
  return record ? rowFromRecord(record) : null;
}

export async function loadRow(id: string, user: AppUser): Promise<IncidentRow | null> {
  const row = await getRow(id);
  return row && canSee(row, user) ? row : null;
}

export async function loadDetail(id: string, user: AppUser): Promise<IncidentDetail | null> {
  const row = await loadRow(id, user);
  if (!row) return null;
  return {
    ...toSummary(row),
    gating_reason: row.gating_reason,
    candidates: row.candidates,
    selected: row.selected,
    item_age: row.item_age,
    escalation: row.escalation,
    resolver: row.resolver,
    extraction: row.extraction as MetadataExtraction | null,
    analysis: row.analysis,
    events: row.events,
    prints: [...row.print_jobs].reverse(),
    image_count: row.image_count,
  };
}

const SUMMARY_FIELDS = [
  "identifier", "incident_number", "app_state", "gating_tier", "thumb", "selected", "extracted_metadata", "resolver", "item_age",
  "unread_for_store", "disposition", "new_tag_added", "missing_price_tag_count", "store_id", "escalation",
];

export interface ListedTicket {
  row: IncidentRow;
  /** The ticket's state in the State Machine workflow. */
  smState: string;
}

/** The tickets a user may see, newest activity first, read with just the fields a list needs. */
export async function listRows(user: AppUser): Promise<ListedTicket[]> {
  const filters: Record<string, string> = user.role === "store" ? { store_id: user.store_id ?? "" } : { escalated: "true" };
  const { items } = await listTickets({ fields: SUMMARY_FIELDS, filters });
  const toListed = (i: TicketListItem): ListedTicket => ({ row: rowFromData(i.id, i.fields, i.created_at, i.updated_at), smState: i.state });
  return items.map(toListed).sort((a, b) => b.row.updated_at.getTime() - a.row.updated_at.getTime());
}

/** Which resolver lane each State Machine state belongs to. */
export const RESOLVER_LANE: Record<string, ResolverState["status"]> = {
  NEW: "NEW",
  NEEDS_L2: "NEW",
  INPROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
  NOT_CT_MERCH: "RESOLVED",
  CANT_RESOLVE: "RESOLVED",
};
