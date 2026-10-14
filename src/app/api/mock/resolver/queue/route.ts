import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { toSummary, type IncidentRow } from "@/lib/mock/incidents";

const LIST_LIMIT = 100;

export async function GET(request: Request) {
  const user = await userFromRequest(request);
  if (user?.role !== "resolver") return jsonError(401, "Could not validate credentials");
  const { rows } = await getPool().query<IncidentRow>(`SELECT * FROM incidents WHERE escalation IS NOT NULL ORDER BY updated_at DESC LIMIT ${LIST_LIMIT}`);
  return NextResponse.json({ items: rows.map(toSummary) });
}
