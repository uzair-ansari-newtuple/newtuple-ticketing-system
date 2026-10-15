import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { buildExtraction } from "@/lib/mock/extract";
import { buildCandidates, gate } from "@/lib/mock/flow";
import { getRow, saveRow, type IncidentRow } from "@/lib/mock/incidents";
import { listProducts } from "./catalog";
import { analyzeStoredPhotos, type StoredPhoto } from "@/lib/ml/server";
import { downloadPhoto, listPhotos } from "@/lib/sm/records";
import type { Candidate, EscalationReason, Gating, MetadataExtraction, NormalizedMetadata, PhotoSlot } from "@/lib/types";

const UUID = /^[0-9a-f-]{36}$/i;
const mark = (row: IncidentRow, stage: string) => ({ ...row.pipeline, [stage]: new Date().toISOString() });

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

async function readPhotos(id: string): Promise<StoredPhoto[]> {
  const files = await listPhotos(id);
  return Promise.all(files.map(async (f) => ({ slot: f.metadata.slot as PhotoSlot, mime_type: f.content_type, data: (await downloadPhoto(f.file_id)).toString("base64") })));
}

/** Stage 1: read the photos with OCR and CLIP and search the catalog. */
export async function runAnalyze(id: string) {
  const row = await getRow(id);
  if (!row) return null;
  if (!row.pipeline.analyze) {
    const { analysis } = await analyzeStoredPhotos(row.store_id, await readPhotos(id));
    await saveRow(row, { analysis, pipeline: mark(row, "analyze") }, { board: { ocr_text: analysis.ocr?.text ?? "" } });
    row.analysis = JSON.parse(JSON.stringify(analysis));
  }
  const { analysis } = row;
  const matches = analysis.top_matches.map((m) => ({ sku: m.metadata.Sku ?? null, similarity: m.similarity }));
  return {
    ok: true,
    analysis_failed: Boolean(analysis.error),
    error: analysis.error,
    ocr_text: analysis.ocr?.text ?? "",
    ocr: analysis.ocr,
    image_matches_json: JSON.stringify(matches),
    image_matches: matches,
  };
}

/** Stage 2: turn the raw analysis into normalized brand, department, class, colour, size and barcode. */
export async function runMapAttributes(id: string) {
  let row = await getRow(id);
  if (!row) return null;
  if (!row.pipeline.analyze) {
    await runAnalyze(id);
    row = (await getRow(id))!;
  }
  if (!row.pipeline.map) {
    const built = buildExtraction(row.analysis);
    const succeeded = !built.error_message;
    const extraction: Partial<MetadataExtraction> = succeeded ? { ...built, status: "completed" } : { status: "failed", error_message: built.error_message };
    const meta = extraction.normalized_metadata;
    await saveRow(row, { extraction, pipeline: mark(row, "map") }, { board: { brand: meta?.Brand ?? "", department: meta?.DepartmentName ?? "" } });
  }
  const mapped = (await getRow(id))!;
  const meta = mapped.extraction?.normalized_metadata ?? null;
  return {
    ok: true,
    analysis_failed: mapped.extraction?.status === "failed",
    brand: meta?.Brand ?? "",
    department: meta?.DepartmentName ?? "",
    extracted_metadata: meta,
    extracted_metadata_json: JSON.stringify(meta),
    missing_fields: mapped.extraction?.missing_fields ?? [],
    warnings: mapped.extraction?.warnings ?? [],
  };
}

/** Stage 3: find candidate products and rate the match green, yellow or red. */
export async function runIdentify(id: string) {
  let row = await getRow(id);
  if (!row) return null;
  if (!row.pipeline.map) {
    await runMapAttributes(id);
    row = (await getRow(id))!;
  }
  if (!row.pipeline.identify) {
    const succeeded = row.extraction?.status === "completed";
    const candidates: Candidate[] = succeeded ? buildCandidates(row.analysis, (row.extraction?.normalized_metadata ?? null) as NormalizedMetadata | null, await listProducts()) : [];
    const { gating, reason } = gate(candidates, !succeeded);
    await saveRow(
      row,
      { candidates, gating, gating_reason: reason, current_state: succeeded ? "CANDIDATES_READY" : "FAILED", pipeline: mark(row, "identify") },
      { event: { type: succeeded ? "ANALYZED" : "ANALYSIS_FAILED", actor: "state-machine", detail: { gating, candidates: candidates.length } } },
    );
  }
  const done = (await getRow(id))!;
  const compact = done.candidates.map((c) => ({ sku: c.sku, score: c.score, evidence: c.evidence }));
  return {
    ok: true,
    gating_tier: done.gating as Gating,
    gating_reason: done.gating_reason as EscalationReason | null,
    candidate_count: compact.length,
    edw_candidates: compact,
    edw_candidates_json: JSON.stringify(compact),
  };
}
