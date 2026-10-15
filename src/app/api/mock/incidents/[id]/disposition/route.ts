import { NextResponse } from "next/server";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { loadRow, saveRow } from "@/lib/mock/incidents";
import type { Disposition } from "@/lib/types";

const DISPOSITIONS: Disposition[] = ["DISCARD", "RETURN_TO_VENDOR", "DONATE"];

/** For items the resolver could not identify or ruled out: the store says what happened to the item and the ticket leaves the inbox. */
export async function POST(request: Request, ctx: RouteContext<"/api/mock/incidents/[id]/disposition">) {
  const user = await userFromRequest(request);
  if (user?.role !== "store") return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { disposition?: Disposition } | null;
  if (!body?.disposition || !DISPOSITIONS.includes(body.disposition)) return jsonError(422, "Choose what happened to the item");

  const row = await loadRow(id, user);
  if (!row) return jsonError(404, "Ticket not found");
  if (row.current_state !== "RESOLVER_RESPONSE_RECEIVED" || row.resolver?.decision === "RECOMMEND") return jsonError(409, "This ticket does not need a disposition");

  await saveRow(row, { current_state: "CLOSED", disposition: body.disposition, unread_for_store: false }, {
    board: { closed_at: new Date().toISOString() },
    event: { type: "DISPOSITION", actor: user.name, detail: { disposition: body.disposition } },
  });
  return NextResponse.json({ state: "CLOSED", disposition: body.disposition });
}
