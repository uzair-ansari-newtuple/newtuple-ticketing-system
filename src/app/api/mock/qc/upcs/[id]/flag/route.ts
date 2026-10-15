import { qcHandler } from "@/lib/qc/http";
import { flagUpc } from "@/lib/qc/service";

export async function POST(request: Request, ctx: RouteContext<"/api/mock/qc/upcs/[id]/flag">) {
  const { id } = await ctx.params;
  return qcHandler(request, (body, user) => flagUpc(id, { reason: body.reason, note: body.note }, user));
}
