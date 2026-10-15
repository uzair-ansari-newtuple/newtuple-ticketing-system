import { NextResponse } from "next/server";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { listRows, RESOLVER_LANE, toSummary } from "@/lib/mock/incidents";

export async function GET(request: Request) {
  const user = await userFromRequest(request);
  if (user?.role !== "resolver") return jsonError(401, "Could not validate credentials");
  const listed = await listRows(user);
  const items = listed.map(({ row, smState }) => {
    const lane = RESOLVER_LANE[smState];
    return lane ? { ...toSummary(row), resolver_status: lane } : toSummary(row);
  });
  return NextResponse.json({ items });
}
