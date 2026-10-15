import { qcHandler } from "@/lib/qc/http";
import { raiseException } from "@/lib/qc/service";

export async function POST(request: Request, ctx: RouteContext<"/api/mock/qc/lines/[id]/exception">) {
  const { id } = await ctx.params;
  return qcHandler(request, (body) => raiseException(id, { received_qty: body.received_qty, reason: body.reason, note: body.note, photo: body.photo }));
}
