import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { productMetadata } from "@/data/catalog";
import { getPool } from "@/lib/db";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { logEvent, numberDisplay } from "@/lib/mock/incidents";
import { getProductByUpc } from "@/lib/mock/products";
import { isValidGtin, normalizeGtin } from "@/lib/taxonomy";
import type { Candidate, ClientAnalysis, FieldSource, MetadataExtraction, NormalizedMetadata, QuickScanBody, QuickScanPath } from "@/lib/types";

const PATHS: QuickScanPath[] = ["BARCODE", "NEARBY_TAG"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_OCR_CHARS = 2000;

const FAST_LANE_ANALYSIS: ClientAnalysis = { model: "quick-scan", match: null, top_matches: [], match_threshold: 0.88, classification: null, ocr: null, error: null };

function fieldSources(meta: NormalizedMetadata): MetadataExtraction["field_sources"] {
  const sources: MetadataExtraction["field_sources"] = {};
  for (const key of Object.keys(meta) as (keyof NormalizedMetadata)[]) {
    if (meta[key]) sources[key] = { source: "barcode" satisfies FieldSource, confidence: 1 };
  }
  return sources;
}

/** Quick Scan (Fast Lane): one barcode or one tagged item in, product out. No candidate matching or gating. */
export async function POST(request: Request) {
  const user = await userFromRequest(request);
  if (user?.role !== "store" || !user.store_id) return jsonError(401, "Could not validate credentials");
  const body = (await request.json().catch(() => null)) as QuickScanBody | null;
  if (!body || !PATHS.includes(body.path)) return jsonError(422, "Choose a scan path");

  const barcode = normalizeGtin(String(body.barcode ?? "").replace(/\s/g, ""));
  if (!isValidGtin(barcode)) return jsonError(422, "That barcode is not valid. Check the number and try again.");

  const image = body.image;
  if (body.path === "NEARBY_TAG") {
    if (!image) return jsonError(422, "A photo of the tagged item is required");
    if (image.mime_type !== "image/jpeg" && image.mime_type !== "image/png") return jsonError(422, "Use a JPEG or PNG photo");
    if (Math.floor((image.image_base64.length * 3) / 4) > MAX_IMAGE_BYTES) return jsonError(422, "Image exceeds the 5 MB limit");
  }

  const product = await getProductByUpc(getPool(), barcode);
  const found = Boolean(product);
  const metadata = product ? productMetadata(product) : null;
  const selected: Candidate | null = metadata && product ? { key: product.sku, sku: product.sku, metadata, score: 1, evidence: "barcode", thumb: null } : null;
  const extraction: Partial<MetadataExtraction> = metadata
    ? {
        status: "completed",
        model_name: "barcode lookup",
        prompt_version: "fast-lane",
        normalized_metadata: metadata,
        ocr_text: body.ocr_text?.slice(0, MAX_OCR_CHARS) || null,
        confidence: 1,
        warnings: [],
        missing_fields: ["Size"],
        field_sources: fieldSources(metadata),
        error_message: null,
      }
    : { status: "failed", model_name: "barcode lookup", prompt_version: "fast-lane", error_message: `Barcode ${barcode} is valid but is not in the catalog.` };

  const incidentId = randomUUID();
  const client = await getPool().connect();
  let row: { number: number };
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO incidents (id, store_id, capture_profile_id, current_state, metadata_job_id, image_count, analysis, embeddings, thumb,
                              gating, gating_reason, candidates, selected, extraction)
       VALUES ($1, $2, 'FAST_LANE', $3, $4, $5, $6, '[]', $7, $8, $9, $10, $11, $12) RETURNING number`,
      [
        incidentId,
        user.store_id,
        found ? "CONFIRMED" : "FAILED",
        randomUUID(),
        image ? 1 : 0,
        JSON.stringify(FAST_LANE_ANALYSIS),
        body.thumb ?? null,
        found ? null : "RED",
        found ? null : "BARCODE_NOT_FOUND",
        JSON.stringify(selected ? [selected] : []),
        selected ? JSON.stringify(selected) : null,
        JSON.stringify(extraction),
      ],
    );
    row = inserted.rows[0];
    if (image) {
      await client.query(
        `INSERT INTO incident_images (incident_id, position, slot, mime_type, sha256, data, capture) VALUES ($1, 0, 'tag', $2, $3, $4, $5)`,
        [incidentId, image.mime_type, image.sha256, image.image_base64, JSON.stringify(image.capture)],
      );
    }
    await logEvent(client, incidentId, "CREATED", user.username, { lane: "FAST_LANE", path: body.path });
    await logEvent(client, incidentId, found ? "BARCODE_MATCHED" : "BARCODE_NOT_FOUND", "system", { barcode, sku: product?.sku ?? null });
    if (found) await logEvent(client, incidentId, "CONFIRMED", "system", { auto: true });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return NextResponse.json({ incident_id: incidentId, incident_number_display: numberDisplay(row.number), found, state: found ? "CONFIRMED" : "FAILED" }, { status: 201 });
}
