import { qcHandler } from "@/lib/qc/http";
import { resolveFlag } from "@/lib/qc/service";

export async function POST(request: Request, ctx: RouteContext<"/api/mock/qc/upcs/[id]/resolve">) {
  const { id } = await ctx.params;
  return qcHandler(request, (body, user) => resolveFlag(id, body.action, body.note, user));
}
