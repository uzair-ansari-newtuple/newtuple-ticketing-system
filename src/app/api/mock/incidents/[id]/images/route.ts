import { NextResponse } from "next/server";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { loadRow } from "@/lib/mock/incidents";
import { downloadPhoto, listPhotos } from "@/lib/sm/records";
import type { CaptureMetadata, PhotoSlot, StoredImage } from "@/lib/types";

export async function GET(request: Request, ctx: RouteContext<"/api/mock/incidents/[id]/images">) {
  const user = await userFromRequest(request);
  if (!user) return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  if (!(await loadRow(id, user))) return jsonError(404, "Ticket not found");
  const files = await listPhotos(id);
  const images = await Promise.all(
    files.map(async (f): Promise<StoredImage> => {
      const bytes = await downloadPhoto(f.file_id);
      return { slot: f.metadata.slot as PhotoSlot, data_url: `data:${f.content_type};base64,${bytes.toString("base64")}`, capture: f.metadata.capture as CaptureMetadata };
    }),
  );
  return NextResponse.json({ images });
}
