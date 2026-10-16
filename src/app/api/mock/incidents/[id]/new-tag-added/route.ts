import { NextResponse } from "next/server";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { isSuperAdmin } from "@/lib/sm/identity";
import { loadRow, saveRow } from "@/lib/mock/incidents";

/** The associate confirms the printed tag is on the item. This completes the ticket. */
export async function POST(request: Request, ctx: RouteContext<"/api/mock/incidents/[id]/new-tag-added">) {
  const user = await userFromRequest(request);
  if (user?.role !== "store" && !isSuperAdmin(user)) return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  const row = await loadRow(id, user);
  if (!row) return jsonError(404, "Ticket not found");
  if (row.current_state !== "PRINTED") return jsonError(409, "Print the tag before confirming it was added");

  await saveRow(row, { current_state: "COMPLETED", new_tag_added: true }, {
    board: { closed_at: new Date().toISOString() },
    event: { type: "NEW_TAG_ADDED", actor: user.name },
  });
  return NextResponse.json({ state: "COMPLETED" });
}
