import { qcHandler } from "@/lib/qc/http";
import { recount } from "@/lib/qc/service";

export async function POST(request: Request, ctx: RouteContext<"/api/mock/qc/lines/[id]/recount">) {
  const { id } = await ctx.params;
  return qcHandler(request, () => recount(id));
}
