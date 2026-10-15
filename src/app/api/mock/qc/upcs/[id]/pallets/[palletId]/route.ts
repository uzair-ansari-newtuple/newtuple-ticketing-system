import { qcHandler } from "@/lib/qc/http";
import { savePallet } from "@/lib/qc/service";

export async function POST(request: Request, ctx: RouteContext<"/api/mock/qc/upcs/[id]/pallets/[palletId]">) {
  const { id, palletId } = await ctx.params;
  return qcHandler(request, (body, user) => savePallet(id, palletId, body as Parameters<typeof savePallet>[2], user.id));
}
