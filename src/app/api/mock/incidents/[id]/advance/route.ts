import { NextResponse } from "next/server";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { isSuperAdmin } from "@/lib/sm/identity";
import { loadRow } from "@/lib/mock/incidents";
import { advancePipeline } from "@/lib/sm/pipeline";

export async function POST(request: Request, ctx: RouteContext<"/api/mock/incidents/[id]/advance">) {
  const user = await userFromRequest(request);
  if (user?.role !== "store" && !isSuperAdmin(user)) return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { trigger?: string } | null;
  if (!body?.trigger) return jsonError(422, "trigger is required");
  if (!(await loadRow(id, user))) return jsonError(404, "Ticket not found");
  try {
    const result = await advancePipeline(id, body.trigger);
    return result.status === 200 ? NextResponse.json({ state: result.state }) : jsonError(result.status, result.detail ?? "Could not advance");
  } catch (err) {
    console.error(`[SM] advance failed for ${id}: ${err instanceof Error ? err.message : err}`);
    return jsonError(502, "The workflow service could not be reached");
  }
}
