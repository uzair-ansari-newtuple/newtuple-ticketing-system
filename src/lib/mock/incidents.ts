import type { Pool, PoolClient } from "pg";
import type { DbUser } from "@/lib/mock/auth";
import type { Candidate, ClientAnalysis, Disposition, Escalation, Gating, IncidentDetail, IncidentEvent, IncidentState, IncidentSummary, ItemAge, MetadataExtraction, PrintJob, ResolverState } from "@/lib/types";

export interface IncidentRow {
  id: string;
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
  extraction: MetadataExtraction | null;
  analysis: ClientAnalysis;
  embeddings: number[][] | null;
  thumb: string | null;
  image_count: number;
  unread_for_store: boolean;
  disposition: Disposition | null;
  new_tag_added: boolean;
  created_at: Date;
  updated_at: Date;
}

export const numberDisplay = (n: number) => `TK-${String(n).padStart(6, "0")}`;

export async function logEvent(db: Pool | PoolClient, incidentId: string, type: string, actor: string, detail: Record<string, unknown> = {}) {
  await db.query(`INSERT INTO incident_events (incident_id, type, actor, detail) VALUES ($1, $2, $3, $4)`, [incidentId, type, actor, JSON.stringify(detail)]);
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
    number_display: numberDisplay(row.number),
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
    store_id: row.store_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/** Stores see their own tickets. Resolvers only see tickets that were escalated to them. */
export function scopeClause(user: DbUser): { sql: string; params: unknown[] } {
  return user.role === "store" ? { sql: "store_id = $2", params: [user.store_id] } : { sql: "escalation IS NOT NULL AND $2::text IS NULL", params: [null] };
}

export async function loadRow(pool: Pool | PoolClient, id: string, user: DbUser): Promise<IncidentRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const scope = scopeClause(user);
  const { rows } = await pool.query<IncidentRow>(`SELECT * FROM incidents WHERE id = $1 AND ${scope.sql}`, [id, ...scope.params]);
  return rows[0] ?? null;
}

export async function loadDetail(pool: Pool, id: string, user: DbUser): Promise<IncidentDetail | null> {
  const row = await loadRow(pool, id, user);
  if (!row) return null;
  const events = await pool.query<{ type: string; actor: string; detail: Record<string, unknown>; created_at: Date }>(
    `SELECT type, actor, detail, created_at FROM incident_events WHERE incident_id = $1 ORDER BY created_at, id`,
    [id],
  );
  const prints = await pool.query<{ id: string; printer: number; copies: number; status: "accepted" | "failed"; message: string | null; upc: string; created_at: Date }>(
    `SELECT id, printer, copies, status, message, upc, created_at FROM print_jobs WHERE incident_id = $1 ORDER BY created_at DESC`,
    [id],
  );
  return {
    ...toSummary(row),
    gating_reason: row.gating_reason,
    candidates: row.candidates,
    selected: row.selected,
    item_age: row.item_age,
    escalation: row.escalation,
    resolver: row.resolver,
    extraction: row.extraction,
    analysis: row.analysis,
    embeddings: user.role === "store" ? row.embeddings : null,
    image_count: row.image_count,
    events: events.rows.map<IncidentEvent>((e) => ({ ...e, created_at: e.created_at.toISOString() })),
    prints: prints.rows.map<PrintJob>((p) => ({ ...p, created_at: p.created_at.toISOString() })),
  };
}
