import exifr from "exifr";

export interface ExifSummary {
  capturedAt: string | null;
  device: string | null;
  orientation: number | null;
  gps: { lat: number; lng: number } | null;
}

export async function readExif(file: Blob): Promise<ExifSummary> {
  const empty: ExifSummary = { capturedAt: null, device: null, orientation: null, gps: null };
  try {
    const tags = await exifr.parse(file, {
      gps: true,
      pick: ["Make", "Model", "DateTimeOriginal", "CreateDate", "Orientation", "latitude", "longitude"],
    });
    if (!tags) return empty;
    const date: Date | undefined = tags.DateTimeOriginal ?? tags.CreateDate;
    const device = [tags.Make, tags.Model].filter(Boolean).join(" ").trim();
    return {
      capturedAt: date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
      device: device || null,
      orientation: typeof tags.Orientation === "number" ? tags.Orientation : null,
      gps:
        typeof tags.latitude === "number" && typeof tags.longitude === "number"
          ? { lat: tags.latitude, lng: tags.longitude }
          : null,
    };
  } catch {
    return empty;
  }
}

export function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60_000 },
    );
  });
}
