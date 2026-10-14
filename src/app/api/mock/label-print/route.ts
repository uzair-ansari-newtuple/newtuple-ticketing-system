import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { loadRow } from "@/lib/mock/incidents";
import { sendLabel } from "@/lib/mock/printing";

export async function POST(request: Request) {
  const user = await userFromRequest(request);
  if (user?.role !== "store" || !user.store_id) return jsonError(401, "Could not validate credentials");
  const body = (await request.json().catch(() => null)) as { incident_id?: string; printer?: number; copies?: number } | null;

  const pool = getPool();
  const row = body?.incident_id ? await loadRow(pool, body.incident_id, user) : null;
  if (!row) return jsonError(404, "Ticket not found");
  const result = await sendLabel(pool, row, { printer: Number(body?.printer), copies: Number(body?.copies), actor: user.username });
  if (!result.ok) return jsonError(result.status, result.detail);
  const { ok: _ok, ...response } = result;
  void _ok;
  return NextResponse.json(response);
}
