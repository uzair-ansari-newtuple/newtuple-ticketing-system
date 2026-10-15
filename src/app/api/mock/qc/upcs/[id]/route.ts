import { qcHandler } from "@/lib/qc/http";
import { getUpc } from "@/lib/qc/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/api/mock/qc/upcs/[id]">) {
  const { id } = await ctx.params;
  return qcHandler(request, () => getUpc(id));
}
