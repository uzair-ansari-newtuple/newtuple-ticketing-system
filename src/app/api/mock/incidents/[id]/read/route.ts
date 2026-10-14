import { getPool } from "@/lib/db";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { loadRow } from "@/lib/mock/incidents";

export async function POST(request: Request, ctx: RouteContext<"/api/mock/incidents/[id]/read">) {
  const user = await userFromRequest(request);
  if (user?.role !== "store") return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  const pool = getPool();
  if (!(await loadRow(pool, id, user))) return jsonError(404, "Ticket not found");
  await pool.query(`UPDATE incidents SET unread_for_store = false WHERE id = $1`, [id]);
  return new Response(null, { status: 204 });
}
