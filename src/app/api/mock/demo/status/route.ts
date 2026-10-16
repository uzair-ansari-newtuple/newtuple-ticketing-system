import { demoStatus } from "@/lib/demo/reset";
import { qcHandler } from "@/lib/qc/http";

export const dynamic = "force-dynamic";

/** How many records each demo workflow holds, by state. */
export async function GET(request: Request) {
  return qcHandler(request, () => demoStatus());
}
