import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { loadRow, logEvent } from "@/lib/mock/incidents";
import { mirror } from "@/lib/sm/mirror";

/** The associate confirms the printed tag is on the item. This completes the ticket. */
export async function POST(request: Request, ctx: RouteContext<"/api/mock/incidents/[id]/new-tag-added">) {
  const user = await userFromRequest(request);
  if (user?.role !== "store") return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  const pool = getPool();
  const row = await loadRow(pool, id, user);
  if (!row) return jsonError(404, "Ticket not found");
  if (row.current_state !== "PRINTED") return jsonError(409, "Print the tag before confirming it was added");

  await pool.query(`UPDATE incidents SET current_state = 'COMPLETED', new_tag_added = true, updated_at = now() WHERE id = $1`, [id]);
  await logEvent(pool, id, "NEW_TAG_ADDED", user.name, {});
  mirror(id, { new_tag_added: true, closed_at: new Date().toISOString() });
  return NextResponse.json({ state: "COMPLETED" });
}
