import { qcHandler } from "@/lib/qc/http";
import { listNotifications } from "@/lib/qc/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return qcHandler(request, async () => ({ items: await listNotifications() }));
}
