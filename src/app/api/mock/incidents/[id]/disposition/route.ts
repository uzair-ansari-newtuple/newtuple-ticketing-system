import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { loadRow, logEvent } from "@/lib/mock/incidents";
import type { Disposition } from "@/lib/types";
import { mirror } from "@/lib/sm/mirror";

const DISPOSITIONS: Disposition[] = ["DISCARD", "RETURN_TO_VENDOR", "DONATE"];

/** For items the resolver could not identify or ruled out: the store says what happened to the item and the ticket leaves the inbox. */
export async function POST(request: Request, ctx: RouteContext<"/api/mock/incidents/[id]/disposition">) {
  const user = await userFromRequest(request);
  if (user?.role !== "store") return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { disposition?: Disposition } | null;
  if (!body?.disposition || !DISPOSITIONS.includes(body.disposition)) return jsonError(422, "Choose what happened to the item");

  const pool = getPool();
  const row = await loadRow(pool, id, user);
  if (!row) return jsonError(404, "Ticket not found");
  if (row.current_state !== "RESOLVER_RESPONSE_RECEIVED" || row.resolver?.decision === "RECOMMEND") return jsonError(409, "This ticket does not need a disposition");

  await pool.query(`UPDATE incidents SET current_state = 'CLOSED', disposition = $2, unread_for_store = false, updated_at = now() WHERE id = $1`, [id, body.disposition]);
  await logEvent(pool, id, "DISPOSITION", user.username, { disposition: body.disposition });
  mirror(id, { disposition: body.disposition === "DISCARD" ? "DISCARD_TRASH" : body.disposition, closed_at: new Date().toISOString() });
  return NextResponse.json({ state: "CLOSED", disposition: body.disposition });
}
