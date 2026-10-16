import { NextResponse } from "next/server";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { isSuperAdmin } from "@/lib/sm/identity";
import { loadRow, saveRow } from "@/lib/mock/incidents";
import { addComment, ticketState } from "@/lib/sm/records";
import { parseItemCount } from "@/lib/mock/item-count";
import type { EscalationReason, ItemAge } from "@/lib/types";

const REASONS: EscalationReason[] = ["TOO_MANY_CANDIDATES", "LOW_EVIDENCE", "CATALOG_UNAVAILABLE", "USER_UNSURE", "PRINT_FAILURE", "OTHER"];
const AGES: ItemAge[] = ["NEW_FREIGHT", "OLD_MERCHANDISE"];
const ESCALATABLE = ["CANDIDATES_READY", "CONFIRMED", "FAILED", "PRINTED"];
const MAX_NOTE = 500;

export async function POST(request: Request, ctx: RouteContext<"/api/mock/incidents/[id]/escalate">) {
  const user = await userFromRequest(request);
  if (user?.role !== "store" && !isSuperAdmin(user)) return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { reason?: EscalationReason; note?: string; item_age?: ItemAge; missing_price_tag_count?: number } | null;
  if (!body?.reason || !REASONS.includes(body.reason)) return jsonError(422, "Choose a reason for requesting assistance");
  if (!body.item_age || !AGES.includes(body.item_age)) return jsonError(422, "Say whether this is new freight or old merchandise");
  const count = parseItemCount(body.missing_price_tag_count);
  if (count === null) return jsonError(422, "Say how many items have a missing tag (1 to 99)");
  const note = (body.note ?? "").trim().slice(0, MAX_NOTE);
  if (body.reason === "OTHER" && !note) return jsonError(422, "Add a short note explaining the problem");

  const row = await loadRow(id, user);
  if (!row) return jsonError(404, "Ticket not found");
  if (!ESCALATABLE.includes(row.current_state)) return jsonError(409, "This ticket cannot be escalated in its current state");
  if ((await ticketState(id)).state === "RESOLVED") return jsonError(409, "This ticket was already resolved. Capture the item again if the label cannot be printed.");

  const escalation = { reason: body.reason, note, item_age: body.item_age, created_at: new Date().toISOString() };
  const resolver = { status: "NEW" as const, claimed_by: null, decision: null, recommended: null, comment: null, responded_at: null };
  await saveRow(
    row,
    { escalation, resolver, item_age: body.item_age, missing_price_tag_count: count, current_state: "ESCALATED" },
    {
      board: { escalated: "true", escalation_note: `${body.reason}${note ? `: ${note}` : ""}`, priority: body.item_age === "NEW_FREIGHT" ? "HIGH" : "LOW", resolver_lane_state: "NEW" },
      event: { type: "ESCALATED", actor: user.name, detail: { reason: body.reason, note } },
    },
  );
  await addComment(id, `${user.name} asked a resolver for help (${body.reason.replaceAll("_", " ").toLowerCase()}, ${body.item_age === "NEW_FREIGHT" ? "new freight" : "old merchandise"}, ${count} item${count === 1 ? "" : "s"})${note ? `: ${note}` : "."}`);
  return NextResponse.json({ state: "ESCALATED", escalation });
}
