import { readExif } from "@/lib/exif";
import type { ProcessedImage } from "@/lib/image";
import type { CaptureMetadata } from "@/lib/types";

/** Builds the capture details stored with a photo (size, hash, EXIF, sharpness). */
export async function buildCaptureMetadata(file: Blob & { name?: string }, source: CaptureMetadata["source"], processed: ProcessedImage): Promise<CaptureMetadata> {
  const exif = source === "uploaded" ? await readExif(file) : null;
  return {
    fileName: file.name ?? `capture-${Date.now()}.jpg`,
    source,
    mimeType: file.type,
    originalBytes: file.size,
    compressedBytes: processed.bytes,
    width: processed.width,
    height: processed.height,
    sha256: processed.sha256,
    capturedAt: exif?.capturedAt ?? (source === "captured" ? new Date().toISOString() : null),
    device: exif?.device ?? null,
    orientation: exif?.orientation ?? null,
    gps: exif?.gps ?? null,
    userAgent: navigator.userAgent,
    blurScore: processed.blurScore,
    brightness: processed.brightness,
  };
}
