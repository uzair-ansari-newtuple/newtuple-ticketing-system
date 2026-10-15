import { qcHandler } from "@/lib/qc/http";
import { addPallet } from "@/lib/qc/service";

export async function POST(request: Request, ctx: RouteContext<"/api/mock/qc/upcs/[id]/pallets">) {
  const { id } = await ctx.params;
  return qcHandler(request, (_body, user) => addPallet(id, user.id));
}
