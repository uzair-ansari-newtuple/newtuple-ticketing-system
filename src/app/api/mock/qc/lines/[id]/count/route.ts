import { qcHandler } from "@/lib/qc/http";
import { submitCount } from "@/lib/qc/service";

export async function POST(request: Request, ctx: RouteContext<"/api/mock/qc/lines/[id]/count">) {
  const { id } = await ctx.params;
  return qcHandler(request, (body) => submitCount(id, { received_qty: body.received_qty, photo: body.photo }));
}
