import { NextResponse } from "next/server";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { isSuperAdmin } from "@/lib/sm/identity";
import { loadRow } from "@/lib/mock/incidents";
import { readPipeline } from "@/lib/sm/pipeline";

export async function GET(request: Request, ctx: RouteContext<"/api/mock/incidents/[id]/pipeline">) {
  const user = await userFromRequest(request);
  if (user?.role !== "store" && !isSuperAdmin(user)) return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  if (!(await loadRow(id, user))) return jsonError(404, "Ticket not found");
  try {
    return NextResponse.json(await readPipeline(id));
  } catch (err) {
    console.error(`[SM] pipeline read failed for ${id}: ${err instanceof Error ? err.message : err}`);
    return jsonError(502, "The workflow service could not be reached");
  }
}
