import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { loadRow } from "@/lib/mock/incidents";
import type { CaptureMetadata, PhotoSlot, StoredImage } from "@/lib/types";

export async function GET(request: Request, ctx: RouteContext<"/api/mock/incidents/[id]/images">) {
  const user = await userFromRequest(request);
  if (!user) return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  const pool = getPool();
  if (!(await loadRow(pool, id, user))) return jsonError(404, "Ticket not found");
  const { rows } = await pool.query<{ slot: PhotoSlot; mime_type: string; data: string; capture: CaptureMetadata }>(
    `SELECT slot, mime_type, data, capture FROM incident_images WHERE incident_id = $1 ORDER BY position`,
    [id],
  );
  const images: StoredImage[] = rows.map((r) => ({ slot: r.slot, data_url: `data:${r.mime_type};base64,${r.data}`, capture: r.capture }));
  return NextResponse.json({ images });
}
