import { qcHandler } from "@/lib/qc/http";
import { reopenUpc } from "@/lib/qc/service";

export async function POST(request: Request, ctx: RouteContext<"/api/mock/qc/upcs/[id]/reopen">) {
  const { id } = await ctx.params;
  return qcHandler(request, (body, user) => reopenUpc(id, body.reason, user.id));
}
