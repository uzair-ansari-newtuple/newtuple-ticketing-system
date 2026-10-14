import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { Pool } from "pg";
import { getPool } from "@/lib/db";
import { buildExtraction } from "@/lib/mock/extract";
import { buildCandidates, gate } from "@/lib/mock/flow";
import { logEvent } from "@/lib/mock/incidents";
import { listProducts } from "@/lib/mock/products";
import { analyzeStoredPhotos, type StoredPhoto } from "@/lib/ml/server";
import type { Candidate, ClientAnalysis, EscalationReason, Gating, MetadataExtraction, NormalizedMetadata } from "@/lib/types";

interface StageRow {
  id: string;
  store_id: string;
  analysis: ClientAnalysis;
  extraction: Partial<MetadataExtraction> | null;
  pipeline: Record<string, string>;
}

const UUID = /^[0-9a-f-]{36}$/i;

/** Connector calls carry a shared key. Only the State Machine worker should know it. */
export function authorizeConnector(request: Request): NextResponse | null {
  const expected = process.env.SM_CONNECTOR_KEY;
  if (!expected) return NextResponse.json({ detail: "Connector key is not configured" }, { status: 503 });
  const given = Buffer.from(request.headers.get("x-api-key") ?? "");
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return NextResponse.json({ detail: "Invalid API key" }, { status: 401 });
  return null;
}

export async function incidentIdFrom(request: Request): Promise<string | NextResponse> {
  const body = (await request.json().catch(() => null)) as { incident_id?: string } | null;
  if (!body?.incident_id || !UUID.test(body.incident_id)) return NextResponse.json({ detail: "incident_id is required" }, { status: 422 });
  return body.incident_id;
}

async function loadRow(pool: Pool, id: string): Promise<StageRow | null> {
  const { rows } = await pool.query<StageRow>(`SELECT id, store_id, analysis, extraction, pipeline FROM incidents WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

const markDone = (stage: string) => `jsonb_set(pipeline, '{${stage}}', to_jsonb(now()::text))`;

/** Stage 1: read the photos with OCR and CLIP and search the catalog. */
export async function runAnalyze(id: string) {
  const pool = getPool();
  const row = await loadRow(pool, id);
  if (!row) return null;
  if (!row.pipeline.analyze) {
    const { rows: photos } = await pool.query<StoredPhoto>(`SELECT slot, mime_type, data FROM incident_images WHERE incident_id = $1 ORDER BY position`, [id]);
    const { analysis, embeddings } = await analyzeStoredPhotos(row.store_id, photos);
    await pool.query(`UPDATE incidents SET analysis = $2, embeddings = $3, pipeline = ${markDone("analyze")}, updated_at = now() WHERE id = $1`, [id, JSON.stringify(analysis), JSON.stringify(embeddings)]);
    row.analysis = analysis;
  }
  const { analysis } = row;
  return {
    ok: true,
    analysis_failed: Boolean(analysis.error),
    error: analysis.error,
    ocr_text: analysis.ocr?.text ?? "",
    ocr: analysis.ocr,
    image_matches: analysis.top_matches.map((m) => ({ sku: m.metadata.Sku ?? null, similarity: m.similarity })),
  };
}

/** Stage 2: turn the raw analysis into normalized brand, department, class, colour, size and barcode. */
export async function runMapAttributes(id: string) {
  const pool = getPool();
  let row = await loadRow(pool, id);
  if (!row) return null;
  if (!row.pipeline.analyze) {
    await runAnalyze(id);
    row = (await loadRow(pool, id))!;
  }
  if (!row.pipeline.map) {
    const built = buildExtraction(row.analysis);
    const succeeded = !built.error_message;
    const extraction: Partial<MetadataExtraction> = succeeded ? { ...built, status: "completed" } : { status: "failed", error_message: built.error_message };
    await pool.query(`UPDATE incidents SET extraction = $2, pipeline = ${markDone("map")}, updated_at = now() WHERE id = $1`, [id, JSON.stringify(extraction)]);
    row.extraction = extraction;
  }
  const meta = row.extraction?.normalized_metadata ?? null;
  return {
    ok: true,
    analysis_failed: row.extraction?.status === "failed",
    brand: meta?.Brand ?? "",
    department: meta?.DepartmentName ?? "",
    extracted_metadata: meta,
    missing_fields: row.extraction?.missing_fields ?? [],
    warnings: row.extraction?.warnings ?? [],
  };
}

/** Stage 3: find candidate products and rate the match green, yellow or red. */
export async function runIdentify(id: string) {
  const pool = getPool();
  let row = await loadRow(pool, id);
  if (!row) return null;
  if (!row.pipeline.map) {
    await runMapAttributes(id);
    row = (await loadRow(pool, id))!;
  }
  let candidates: Candidate[];
  let gating: Gating;
  let reason: EscalationReason | null;
  if (!row.pipeline.identify) {
    const succeeded = row.extraction?.status === "completed";
    candidates = succeeded ? buildCandidates(row.analysis, (row.extraction?.normalized_metadata ?? null) as NormalizedMetadata | null, await listProducts(pool)) : [];
    ({ gating, reason } = gate(candidates, !succeeded));
    await pool.query(
      `UPDATE incidents SET candidates = $2, gating = $3, gating_reason = $4, current_state = $5, pipeline = ${markDone("identify")}, updated_at = now() WHERE id = $1`,
      [id, JSON.stringify(candidates), gating, reason, succeeded ? "CANDIDATES_READY" : "FAILED"],
    );
    await logEvent(pool, id, succeeded ? "ANALYZED" : "ANALYSIS_FAILED", "state-machine", { gating, candidates: candidates.length });
  } else {
    const stored = await pool.query<{ candidates: Candidate[]; gating: Gating; gating_reason: EscalationReason | null }>(`SELECT candidates, gating, gating_reason FROM incidents WHERE id = $1`, [id]);
    ({ candidates, gating, gating_reason: reason } = stored.rows[0]);
  }
  return {
    ok: true,
    gating_tier: gating,
    gating_reason: reason,
    candidate_count: candidates.length,
    edw_candidates: candidates.map((c) => ({ sku: c.sku, score: c.score, evidence: c.evidence })),
  };
}
