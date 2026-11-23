import { NextResponse } from "next/server";
import { jsonError, requireStore, userFromRequest } from "@/lib/mock/http";
import { loadRow } from "@/lib/mock/incidents";
import { sendLabel } from "@/lib/mock/printing";

export async function POST(request: Request) {
  const needed = requireStore(await userFromRequest(request));
  if (needed.error) return needed.error;
  const user = needed.user;
  const body = (await request.json().catch(() => null)) as { incident_id?: string; printer?: number; copies?: number } | null;

  const row = body?.incident_id ? await loadRow(body.incident_id, user) : null;
  if (!row) return jsonError(404, "Ticket not found");
  const result = await sendLabel(row, { printer: Number(body?.printer), copies: Number(body?.copies), actor: user.name });
  if (!result.ok) return jsonError(result.status, result.detail);
  const { ok: _ok, ...response } = result;
  void _ok;
  return NextResponse.json(response);
}
