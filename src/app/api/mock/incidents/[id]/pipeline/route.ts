import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { loadRow } from "@/lib/mock/incidents";
import { readPipeline } from "@/lib/sm/pipeline";

export async function GET(request: Request, ctx: RouteContext<"/api/mock/incidents/[id]/pipeline">) {
  const user = await userFromRequest(request);
  if (user?.role !== "store") return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  if (!(await loadRow(getPool(), id, user))) return jsonError(404, "Ticket not found");
  try {
    return NextResponse.json(await readPipeline(id));
  } catch (err) {
    console.error(`[SM] pipeline read failed for ${id}: ${err instanceof Error ? err.message : err}`);
    return jsonError(502, "The workflow service could not be reached");
  }
}
