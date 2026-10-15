import { NextResponse } from "next/server";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { loadRow, saveRow } from "@/lib/mock/incidents";
import { ticketState } from "@/lib/sm/records";

export async function POST(request: Request, ctx: RouteContext<"/api/mock/resolver/incidents/[id]/claim">) {
  const user = await userFromRequest(request);
  if (user?.role !== "resolver") return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  const row = await loadRow(id, user);
  if (!row) return jsonError(404, "Ticket not found");
  if (row.current_state !== "ESCALATED" || row.resolver?.status !== "NEW") return jsonError(409, "This ticket was already claimed");
  if ((await ticketState(id)).state !== "NEW") return jsonError(409, "This ticket is not ready to claim yet");

  const resolver = { ...row.resolver, status: "IN_PROGRESS" as const, claimed_by: user.id };
  await saveRow(row, { resolver, current_state: "RESOLUTION_IN_PROGRESS" }, {
    board: { resolver_id: user.id, resolver_name: user.name, resolver_lane_state: "IN_PROGRESS" },
    event: { type: "CLAIMED", actor: user.name },
    trigger: "to_inprogress",
    assignee: user.id,
  });
  return NextResponse.json({ state: "RESOLUTION_IN_PROGRESS", resolver });
}
