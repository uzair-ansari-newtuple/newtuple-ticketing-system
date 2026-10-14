import { NextResponse } from "next/server";
import { printLabelFor } from "@/lib/sm/actions";
import { authorizeConnector, incidentIdFrom } from "@/lib/sm/stages";

export async function POST(request: Request) {
  const denied = authorizeConnector(request);
  if (denied) return denied;
  const clone = request.clone();
  const id = await incidentIdFrom(request);
  if (id instanceof NextResponse) return id;
  const body = (await clone.json().catch(() => ({}))) as { printer?: number; copies?: number };
  const result = await printLabelFor(id, body.printer === undefined ? undefined : Number(body.printer), body.copies === undefined ? undefined : Number(body.copies));
  return NextResponse.json(result.body, { status: result.status });
}
