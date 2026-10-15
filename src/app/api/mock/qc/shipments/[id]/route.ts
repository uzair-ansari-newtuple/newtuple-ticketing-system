import { qcHandler } from "@/lib/qc/http";
import { getShipment, QcError } from "@/lib/qc/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/api/mock/qc/shipments/[id]">) {
  const { id } = await ctx.params;
  return qcHandler(request, async () => {
    const shipment = await getShipment(id);
    if (!shipment) throw new QcError(404, "Shipment not found");
    return shipment;
  });
}
