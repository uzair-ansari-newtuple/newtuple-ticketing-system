import { qcHandler } from "@/lib/qc/http";
import { listPos } from "@/lib/qc/service";
import { fetchPurchaseOrders } from "@/lib/qc/sm";

/** Pulls the purchase orders that arrived at the DC into the State Machine. */
export async function POST(request: Request) {
  return qcHandler(request, async () => {
    const { created } = await fetchPurchaseOrders();
    return { created, items: await listPos() };
  });
}
