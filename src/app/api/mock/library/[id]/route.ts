import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { jsonError, storeIdFromRequest } from "@/lib/mock/http";

export async function DELETE(request: Request, ctx: RouteContext<"/api/mock/library/[id]">) {
  const storeId = await storeIdFromRequest(request);
  if (!storeId) return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError(404, "Item not found");
  const { rowCount } = await getPool().query(`DELETE FROM reference_items WHERE id = $1 AND kind = 'user' AND store_id = $2`, [id, storeId]);
  return rowCount ? new NextResponse(null, { status: 204 }) : jsonError(404, "Item not found");
}
