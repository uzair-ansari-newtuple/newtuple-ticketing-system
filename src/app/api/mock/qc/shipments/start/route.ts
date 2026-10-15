import { qcHandler } from "@/lib/qc/http";
import { listShipments, QcError, startShipments } from "@/lib/qc/service";

export async function POST(request: Request) {
  return qcHandler(request, async (body, user) => {
    const ids = Array.isArray(body.shipment_ids) ? body.shipment_ids.filter((x): x is string => typeof x === "string") : [];
    if (!ids.length) throw new QcError(422, "Choose at least one shipment");
    await startShipments(ids, user.id);
    return { items: await listShipments() };
  });
}
