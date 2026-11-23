import { qcHandler } from "@/lib/qc/http";
import { listShipments } from "@/lib/qc/service";
import { fetchShipments } from "@/lib/qc/sm";

// Bringing in every sample shipment makes about a hundred State Machine calls, which is longer than the default limit on Vercel.
export const maxDuration = 300;

/** Pulls the shipments that arrived at the DC into the State Machine. */
export async function POST(request: Request) {
  return qcHandler(request, async () => {
    const { created } = await fetchShipments();
    return { created, items: await listShipments() };
  });
}
