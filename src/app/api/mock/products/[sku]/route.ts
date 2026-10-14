import { getPool } from "@/lib/db";
import { jsonError, userFromRequest } from "@/lib/mock/http";

export async function DELETE(request: Request, ctx: RouteContext<"/api/mock/products/[sku]">) {
  const user = await userFromRequest(request);
  if (!user) return jsonError(401, "Could not validate credentials");
  const { sku } = await ctx.params;
  const pool = getPool();
  await pool.query(`DELETE FROM reference_items WHERE kind = 'catalog' AND sku = $1`, [sku]);
  const { rowCount } = await pool.query(`DELETE FROM products WHERE sku = $1`, [sku]);
  return rowCount ? new Response(null, { status: 204 }) : jsonError(404, "Product not found");
}
