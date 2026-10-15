import { qcHandler } from "@/lib/qc/http";
import { listShipments } from "@/lib/qc/service";
import { fetchShipments } from "@/lib/qc/sm";

/** Pulls the shipments that arrived at the DC into the State Machine. */
export async function POST(request: Request) {
  return qcHandler(request, async () => {
    const { created } = await fetchShipments();
    return { created, items: await listShipments() };
  });
}
