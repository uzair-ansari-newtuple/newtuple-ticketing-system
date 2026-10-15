import { qcHandler } from "@/lib/qc/http";
import { getPo, QcError } from "@/lib/qc/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/api/mock/qc/pos/[id]">) {
  const { id } = await ctx.params;
  return qcHandler(request, async () => {
    const po = await getPo(id);
    if (!po) throw new QcError(404, "Purchase order not found");
    return po;
  });
}
