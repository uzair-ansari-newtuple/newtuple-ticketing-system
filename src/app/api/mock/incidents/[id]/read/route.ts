import { jsonError, userFromRequest } from "@/lib/mock/http";
import { isSuperAdmin } from "@/lib/sm/identity";
import { loadRow, saveRow } from "@/lib/mock/incidents";

export async function POST(request: Request, ctx: RouteContext<"/api/mock/incidents/[id]/read">) {
  const user = await userFromRequest(request);
  if (user?.role !== "store" && !isSuperAdmin(user)) return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  const row = await loadRow(id, user);
  if (!row) return jsonError(404, "Ticket not found");
  if (row.unread_for_store) await saveRow(row, { unread_for_store: false });
  return new Response(null, { status: 204 });
}
