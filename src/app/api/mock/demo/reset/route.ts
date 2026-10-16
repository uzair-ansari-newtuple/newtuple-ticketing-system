import { resetDemo } from "@/lib/demo/reset";
import { qcHandler } from "@/lib/qc/http";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Puts the three demo workflows back at the start. */
export async function POST(request: Request) {
  return qcHandler(request, () => resetDemo());
}
