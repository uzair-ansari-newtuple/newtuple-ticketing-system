import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { numberDisplay, scopeClause, toSummary, type IncidentRow, logEvent } from "@/lib/mock/incidents";
import type { ClientAnalysis, ImagePayload, Incident, QualityCheckResult } from "@/lib/types";
import { mirror } from "@/lib/sm/mirror";

const MAX_IMAGES = 5;
const LIST_LIMIT = 100;

export async function GET(request: Request) {
  const user = await userFromRequest(request);
  if (!user) return jsonError(401, "Could not validate credentials");
  const scope = scopeClause(user);
  const { rows } = await getPool().query<IncidentRow>(`SELECT * FROM incidents WHERE ${scope.sql.replace("$2", "$1")} ORDER BY updated_at DESC LIMIT ${LIST_LIMIT}`, scope.params);
  return NextResponse.json({ items: rows.map(toSummary) });
}

export async function POST(request: Request) {
  const user = await userFromRequest(request);
  if (user?.role !== "store" || !user.store_id) return jsonError(401, "Could not validate credentials");
  const body = (await request.json().catch(() => null)) as {
    quality_check_id?: string;
    images?: ImagePayload[];
    client_analysis?: ClientAnalysis;
    embeddings?: number[][];
    thumb?: string;
  } | null;

  const images = body?.images;
  if (!images?.length) return jsonError(422, "At least one image is required");
  if (images.length > MAX_IMAGES) return jsonError(422, `PHOTO_LANE accepts at most ${MAX_IMAGES} images`);
  if (new Set(images.map((i) => i.sha256)).size !== images.length) {
    return jsonError(422, "Duplicate image detected. Each photo must be unique.");
  }
  if (!body?.client_analysis) return jsonError(422, "client_analysis is required");

  const qcRow = body.quality_check_id && /^[0-9a-f-]{36}$/i.test(body.quality_check_id)
    ? (await getPool().query<{ result: QualityCheckResult }>(`SELECT result FROM quality_checks WHERE id = $1 AND store_id = $2 AND NOT consumed`, [body.quality_check_id, user.store_id])).rows[0]
    : undefined;
  const qc = qcRow?.result;
  if (!qc) return jsonError(422, "A valid quality_check_id is required (it may have been used already).");
  if (Date.parse(qc.expires_at) < Date.now()) return jsonError(422, "Quality check expired. Run it again.");
  if (!qc.can_create_incident) return jsonError(422, qc.failed_description ?? "Quality check failed");
  const hashes = new Set(qc.images.map((i) => i.sha256));
  if (images.length !== hashes.size || images.some((i) => !hashes.has(i.sha256))) {
    return jsonError(422, "Images do not match the quality-checked images");
  }

  const incidentId = randomUUID();
  const jobId = randomUUID();
  const client = await getPool().connect();
  let row: { number: number; created_at: Date };
  try {
    await client.query("BEGIN");
    const consumed = await client.query(`UPDATE quality_checks SET consumed = true WHERE id = $1 AND NOT consumed`, [qc.quality_check_id]);
    if (!consumed.rowCount) {
      await client.query("ROLLBACK");
      return jsonError(422, "A valid quality_check_id is required (it may have been used already).");
    }
    const inserted = await client.query(
      `INSERT INTO incidents (id, store_id, metadata_job_id, image_count, analysis, embeddings, thumb)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING number, created_at`,
      [incidentId, user.store_id, jobId, images.length, JSON.stringify(body.client_analysis), JSON.stringify(body.embeddings ?? []), body.thumb ?? null],
    );
    row = inserted.rows[0];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      await client.query(
        `INSERT INTO incident_images (incident_id, position, slot, mime_type, sha256, data, capture) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [incidentId, i, img.slot, img.mime_type, img.sha256, img.image_base64, JSON.stringify(img.capture)],
      );
    }
    await logEvent(client, incidentId, "CREATED", user.username, { images: images.length });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  mirror(incidentId);

  const incident: Incident = {
    incident_id: incidentId,
    incident_number_display: numberDisplay(row.number),
    store_id: user.store_id,
    current_state: "METADATA_PENDING",
    capture_profile_id: "PHOTO_LANE",
    created_at: row.created_at.toISOString(),
    metadata_job_id: jobId,
    image_count: images.length,
  };
  return NextResponse.json({ ...incident, metadata_extraction_status: "pending" }, { status: 201 });
}
