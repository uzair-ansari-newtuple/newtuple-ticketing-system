import { qcHandler } from "@/lib/qc/http";
import { completeShipment } from "@/lib/qc/service";

export async function POST(request: Request, ctx: RouteContext<"/api/mock/qc/shipments/[id]/complete">) {
  const { id } = await ctx.params;
  return qcHandler(request, () => completeShipment(id));
}
