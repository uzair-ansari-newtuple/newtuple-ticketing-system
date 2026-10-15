import { qcHandler } from "@/lib/qc/http";
import { approveUpc } from "@/lib/qc/service";

export async function POST(request: Request, ctx: RouteContext<"/api/mock/qc/upcs/[id]/approve">) {
  const { id } = await ctx.params;
  return qcHandler(request, (body, user) => approveUpc(id, user.id));
}
