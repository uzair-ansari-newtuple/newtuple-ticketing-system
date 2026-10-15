import { qcHandler } from "@/lib/qc/http";
import { completePo } from "@/lib/qc/service";

export async function POST(request: Request, ctx: RouteContext<"/api/mock/qc/pos/[id]/complete">) {
  const { id } = await ctx.params;
  return qcHandler(request, (body) => completePo(id, body.note));
}
