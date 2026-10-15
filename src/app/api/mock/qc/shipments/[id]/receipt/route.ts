import { qcHandler } from "@/lib/qc/http";
import { receipt } from "@/lib/qc/service";

export async function POST(request: Request, ctx: RouteContext<"/api/mock/qc/shipments/[id]/receipt">) {
  const { id } = await ctx.params;
  return qcHandler(request, (body, user) => receipt(id, body.action, { user, confirmation_number: body.confirmation_number, note: body.note }));
}
