import { qcHandler } from "@/lib/qc/http";
import { listFlagged } from "@/lib/qc/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return qcHandler(request, async () => ({ items: await listFlagged() }));
}
