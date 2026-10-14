import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { parseItemCount } from "@/lib/mock/item-count";
import { loadRow, logEvent } from "@/lib/mock/incidents";
import type { EscalationReason, ItemAge } from "@/lib/types";
import { mirror } from "@/lib/sm/mirror";

const REASONS: EscalationReason[] = ["TOO_MANY_CANDIDATES", "LOW_EVIDENCE", "CATALOG_UNAVAILABLE", "USER_UNSURE", "PRINT_FAILURE", "OTHER"];
const AGES: ItemAge[] = ["NEW_FREIGHT", "OLD_MERCHANDISE"];
const ESCALATABLE = ["CANDIDATES_READY", "CONFIRMED", "FAILED", "PRINTED"];
const MAX_NOTE = 500;

export async function POST(request: Request, ctx: RouteContext<"/api/mock/incidents/[id]/escalate">) {
  const user = await userFromRequest(request);
  if (user?.role !== "store") return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { reason?: EscalationReason; note?: string; item_age?: ItemAge; missing_price_tag_count?: number } | null;
  if (!body?.reason || !REASONS.includes(body.reason)) return jsonError(422, "Choose a reason for requesting assistance");
  if (!body.item_age || !AGES.includes(body.item_age)) return jsonError(422, "Say whether this is new freight or old merchandise");
  const count = parseItemCount(body.missing_price_tag_count);
  if (count === null) return jsonError(422, "Say how many items have a missing tag (1 to 99)");
  const note = (body.note ?? "").trim().slice(0, MAX_NOTE);
  if (body.reason === "OTHER" && !note) return jsonError(422, "Add a short note explaining the problem");

  const pool = getPool();
  const row = await loadRow(pool, id, user);
  if (!row) return jsonError(404, "Ticket not found");
  if (!ESCALATABLE.includes(row.current_state)) return jsonError(409, "This ticket cannot be escalated in its current state");

  const escalation = { reason: body.reason, note, item_age: body.item_age, created_at: new Date().toISOString() };
  const resolver = { status: "NEW", claimed_by: null, decision: null, recommended: null, comment: null, responded_at: null };
  await pool.query(
    `UPDATE incidents SET escalation = $2, resolver = $3, item_age = $4, missing_price_tag_count = $5, current_state = 'ESCALATED', updated_at = now() WHERE id = $1`,
    [id, JSON.stringify(escalation), JSON.stringify(resolver), body.item_age, count],
  );
  await logEvent(pool, id, "ESCALATED", user.username, { reason: body.reason, note });
  mirror(id, { escalation_note: `${body.reason}${note ? `: ${note}` : ""}`, item_age: body.item_age, priority: body.item_age === "NEW_FREIGHT" ? "HIGH" : "LOW", resolver_lane_state: "NEW", missing_price_tag_count: count });
  return NextResponse.json({ state: "ESCALATED", escalation });
}
