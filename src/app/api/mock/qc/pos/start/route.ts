import { qcHandler } from "@/lib/qc/http";
import { listPos, QcError, startPos } from "@/lib/qc/service";

export async function POST(request: Request) {
  return qcHandler(request, async (body) => {
    const ids = Array.isArray(body.po_ids) ? body.po_ids.filter((x): x is string => typeof x === "string") : [];
    if (!ids.length) throw new QcError(422, "Choose at least one purchase order");
    await startPos(ids);
    return { items: await listPos() };
  });
}
