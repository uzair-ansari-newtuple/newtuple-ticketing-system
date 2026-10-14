import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { loadRow, logEvent } from "@/lib/mock/incidents";

export async function POST(request: Request, ctx: RouteContext<"/api/mock/resolver/incidents/[id]/claim">) {
  const user = await userFromRequest(request);
  if (user?.role !== "resolver") return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  const pool = getPool();
  const row = await loadRow(pool, id, user);
  if (!row) return jsonError(404, "Ticket not found");
  if (row.current_state !== "ESCALATED" || row.resolver?.status !== "NEW") return jsonError(409, "This ticket was already claimed");
  const resolver = { ...row.resolver, status: "IN_PROGRESS", claimed_by: user.username };
  await pool.query(`UPDATE incidents SET resolver = $2, current_state = 'RESOLUTION_IN_PROGRESS', updated_at = now() WHERE id = $1`, [id, JSON.stringify(resolver)]);
  await logEvent(pool, id, "CLAIMED", user.username, {});
  return NextResponse.json({ state: "RESOLUTION_IN_PROGRESS", resolver });
}
