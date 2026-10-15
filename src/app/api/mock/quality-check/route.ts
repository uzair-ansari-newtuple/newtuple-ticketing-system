import { NextResponse } from "next/server";
import { jsonError, storeIdFromRequest } from "@/lib/mock/http";
import { saveQuality } from "@/lib/mock/quality";
import type { ImagePayload, QualityImageResult } from "@/lib/types";

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const QUALITY_TTL_MS = 15 * 60 * 1000;
const MIN_BLUR_SCORE = 12;
const MIN_BRIGHTNESS = 45;
const BLOWN_OUT_BRIGHTNESS = 252;
const MIN_SIDE_PX = 400;

function judge(image: ImagePayload): QualityImageResult {
  const { blur_score, brightness, width, height } = image.quality_hint;
  let failure: string | null = null;
  if (Math.min(width, height) < MIN_SIDE_PX) failure = "Image resolution is too low. Move closer and retake.";
  else if (blur_score < MIN_BLUR_SCORE) failure = "Image is blurry. Hold steady and retake.";
  else if (brightness < MIN_BRIGHTNESS) failure = "Image is too dark. Add light and retake.";
  else if (brightness > BLOWN_OUT_BRIGHTNESS) failure = "Image is overexposed. Reduce glare and retake.";
  return { client_image_id: image.client_image_id, sha256: image.sha256, passed: failure === null, failed_description: failure };
}

export async function POST(request: Request) {
  const storeId = await storeIdFromRequest(request);
  if (!storeId) return jsonError(401, "Could not validate credentials");
  const body = (await request.json().catch(() => null)) as { images?: ImagePayload[] } | null;
  const images = body?.images;
  if (!images?.length) return jsonError(422, "At least one image is required");
  if (images.length > MAX_IMAGES) return jsonError(422, `PHOTO_LANE accepts at most ${MAX_IMAGES} images`);
  if (images.some((i) => Math.floor((i.image_base64.length * 3) / 4) > MAX_IMAGE_BYTES)) {
    return jsonError(422, "Image exceeds the 5 MB limit");
  }

  const results = images.map(judge);
  const failed = results.filter((r) => !r.passed);
  const now = Date.now();
  const saved = await saveQuality(storeId, {
    can_create_incident: failed.length === 0,
    failed_description: failed[0]?.failed_description ?? null,
    images: results,
    checked_at: new Date(now).toISOString(),
    expires_at: new Date(now + QUALITY_TTL_MS).toISOString(),
  });
  return NextResponse.json({ job_id: saved.quality_check_id, job_type: "quality_check", status: "pending" }, { status: 202 });
}
