import { qcHandler } from "@/lib/qc/http";
import { resolveException } from "@/lib/qc/service";

export async function POST(request: Request, ctx: RouteContext<"/api/mock/qc/lines/[id]/resolve">) {
  const { id } = await ctx.params;
  return qcHandler(request, (body) => resolveException(id, body.note));
}
