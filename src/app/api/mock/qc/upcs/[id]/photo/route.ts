import { qcHandler } from "@/lib/qc/http";
import { addPhoto } from "@/lib/qc/service";

export async function POST(request: Request, ctx: RouteContext<"/api/mock/qc/upcs/[id]/photo">) {
  const { id } = await ctx.params;
  return qcHandler(request, (body, user) => addPhoto(id, body.photo, user.id));
}
