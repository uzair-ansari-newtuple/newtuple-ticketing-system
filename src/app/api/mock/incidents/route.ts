import { NextResponse } from "next/server";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { EMPTY_ANALYSIS, listRows, toSummary } from "@/lib/mock/incidents";
import { consumeQuality, getQuality, releaseQuality } from "@/lib/mock/quality";
import { smBaseUrl } from "@/lib/sm/client";
import { createRecord, deleteRecord, enroll, putRecord, uploadPhoto } from "@/lib/sm/records";
import type { Incident, ImagePayload } from "@/lib/types";

const MAX_IMAGES = 5;

export async function GET(request: Request) {
  const user = await userFromRequest(request);
  if (!user) return jsonError(401, "Could not validate credentials");
  const listed = await listRows(user);
  return NextResponse.json({ items: listed.map((l) => toSummary(l.row)) });
}

export async function POST(request: Request) {
  const user = await userFromRequest(request);
  if (user?.role !== "store" || !user.store_id) return jsonError(401, "Could not validate credentials");
  const body = (await request.json().catch(() => null)) as { quality_check_id?: string; images?: ImagePayload[]; thumb?: string } | null;
  if (!body) return jsonError(422, "Invalid request");

  const images = body.images;
  if (!images?.length) return jsonError(422, "At least one image is required");
  if (images.length > MAX_IMAGES) return jsonError(422, `PHOTO_LANE accepts at most ${MAX_IMAGES} images`);
  if (new Set(images.map((i) => i.sha256)).size !== images.length) {
    return jsonError(422, "Duplicate image detected. Each photo must be unique.");
  }

  const check = body.quality_check_id ? await getQuality(body.quality_check_id) : null;
  const qc = check && check.store_id === user.store_id && !check.consumed ? check.result : null;
  if (!qc) return jsonError(422, "A valid quality_check_id is required (it may have been used already).");
  if (Date.parse(qc.expires_at) < Date.now()) return jsonError(422, "Quality check expired. Run it again.");
  if (!qc.can_create_incident) return jsonError(422, qc.failed_description ?? "Quality check failed");
  const hashes = new Set(qc.images.map((i) => i.sha256));
  if (images.length !== hashes.size || images.some((i) => !hashes.has(i.sha256))) {
    return jsonError(422, "Images do not match the quality-checked images");
  }
  if (!(await consumeQuality(qc.quality_check_id))) return jsonError(422, "A valid quality_check_id is required (it may have been used already).");

  const now = new Date().toISOString();
  let ticketId: string | null = null;
  try {
    // The State Machine picks the id and the number. The photos go in before the ticket is enrolled, because the connectors read them as soon as it is.
    const created = await createRecord("incident", {
      identifier: `pending-${crypto.randomUUID()}`,
      source: "ticketing_app",
      store_id: user.store_id,
      store_name: user.store_name,
      created_by_user_id: user.id,
      capture_profile_id: "PHOTO_LANE",
      image_count: images.length,
      created_at: now,
      submitted_at: now,
      app_state: "METADATA_PENDING",
      analysis: JSON.stringify(EMPTY_ANALYSIS),
      thumb: body.thumb ?? "",
      pipeline: "{}",
      missing_price_tag_count: 1,
      unread_for_store: "false",
      escalated: "false",
      resolver_lane_state: "NEW",
      event_log: JSON.stringify([{ type: "CREATED", actor: user.name, detail: { images: images.length }, created_at: now }]),
    });
    ticketId = created.id;
    const display = String(created.data.incident_number);
    await putRecord(ticketId, { identifier: display, incident_id: ticketId, bot_service_incident_id: ticketId });
    const fileIds = await Promise.all(
      images.map((img, position) =>
        uploadPhoto(ticketId!, {
          bytes: Buffer.from(img.image_base64, "base64"),
          mime: img.mime_type,
          filename: `${img.slot}-${position + 1}.${img.mime_type === "image/png" ? "png" : "jpg"}`,
          metadata: { slot: img.slot, position, sha256: img.sha256, mime_type: img.mime_type, capture: img.capture },
        }),
      ),
    );
    await putRecord(ticketId, {
      photos: JSON.stringify(fileIds.map((file_id, position) => ({ file_id, slot: images[position].slot, position }))),
      photo_urls: JSON.stringify(fileIds.map((file_id) => `${smBaseUrl()}/filehandler/${file_id}/download`)),
    });
    await enroll(ticketId);

    const incident: Incident = {
      incident_id: ticketId,
      incident_number_display: display,
      store_id: user.store_id,
      current_state: "METADATA_PENDING",
      capture_profile_id: "PHOTO_LANE",
      created_at: now,
      metadata_job_id: ticketId,
      image_count: images.length,
    };
    return NextResponse.json({ ...incident, metadata_extraction_status: "pending" }, { status: 201 });
  } catch (err) {
    console.error(`[SM] creating a ticket failed: ${err instanceof Error ? err.message : err}`);
    if (ticketId) await deleteRecord(ticketId).catch(() => undefined);
    await releaseQuality(qc.quality_check_id).catch(() => undefined);
    const cause = process.env.NODE_ENV === "production" || !(err instanceof Error) ? "" : ` (${err.message})`;
    return jsonError(502, `The ticket could not be saved. Please try again.${cause}`);
  }
}
