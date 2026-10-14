import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { jsonError, storeIdFromRequest } from "@/lib/mock/http";
import { buildExtraction } from "@/lib/mock/extract";
import { buildCandidates, gate } from "@/lib/mock/flow";
import { logEvent } from "@/lib/mock/incidents";
import { listProducts } from "@/lib/mock/products";
import { EXTRACTION_DURATION_MS } from "@/lib/mock/store";
import type { ClientAnalysis, MetadataExtraction } from "@/lib/types";

const RUNNING_AFTER_MS = 300;

export async function GET(request: Request, ctx: RouteContext<"/api/mock/incidents/[id]/metadata-extraction">) {
  const storeId = await storeIdFromRequest(request);
  if (!storeId) return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError(404, "No extraction found for this incident");

  const { rows } = await getPool().query(
    `SELECT analysis, extraction, EXTRACT(EPOCH FROM (now() - created_at)) * 1000 AS elapsed_ms
     FROM incidents WHERE id = $1 AND store_id = $2`,
    [id, storeId],
  );
  const row = rows[0];
  if (!row) return jsonError(404, "No extraction found for this incident");

  const base: MetadataExtraction = {
    extraction_id: id,
    incident_id: id,
    lane: "PHOTO_LANE",
    status: "pending",
    model_name: "clip-vit-base-patch32 + tesseract",
    prompt_version: "browser-v1",
    normalized_metadata: null,
    ocr_text: null,
    confidence: null,
    warnings: [],
    missing_fields: [],
    field_sources: {},
    error_message: null,
    updated_at: new Date().toISOString(),
  };

  if (row.extraction) return NextResponse.json({ ...base, ...row.extraction });

  const elapsed = Number(row.elapsed_ms);
  if (elapsed < EXTRACTION_DURATION_MS) {
    return NextResponse.json<MetadataExtraction>({ ...base, status: elapsed > RUNNING_AFTER_MS ? "running" : "pending" });
  }

  const analysis = row.analysis as ClientAnalysis;
  const built = buildExtraction(analysis);
  const succeeded = Boolean(built && !built.error_message);
  const result: Partial<MetadataExtraction> = succeeded
    ? { ...built, status: "completed" }
    : { status: "failed", error_message: built?.error_message ?? "Analysis failed" };

  const candidates = succeeded ? buildCandidates(analysis, built!.normalized_metadata, await listProducts(getPool())) : [];
  const { gating, reason } = gate(candidates, !succeeded);
  const updated = await getPool().query(
    `UPDATE incidents SET extraction = $2, current_state = $3, candidates = $4, gating = $5, gating_reason = $6, updated_at = now()
     WHERE id = $1 AND extraction IS NULL`,
    [id, JSON.stringify(result), succeeded ? "CANDIDATES_READY" : "FAILED", JSON.stringify(candidates), gating, reason],
  );
  if (updated.rowCount) await logEvent(getPool(), id, succeeded ? "ANALYZED" : "ANALYSIS_FAILED", "system", { gating, candidates: candidates.length });
  return NextResponse.json<MetadataExtraction>({ ...base, ...result, updated_at: new Date().toISOString() });
}
