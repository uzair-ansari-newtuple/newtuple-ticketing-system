import { qcHandler } from "@/lib/qc/http";
import { getLine } from "@/lib/qc/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/api/mock/qc/lines/[id]">) {
  const { id } = await ctx.params;
  return qcHandler(request, () => getLine(id));
}
