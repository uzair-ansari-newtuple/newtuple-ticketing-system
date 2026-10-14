import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { loadDetail } from "@/lib/mock/incidents";

export async function GET(request: Request, ctx: RouteContext<"/api/mock/incidents/[id]">) {
  const user = await userFromRequest(request);
  if (!user) return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  const detail = await loadDetail(getPool(), id, user);
  return detail ? NextResponse.json(detail) : jsonError(404, "Ticket not found");
}
