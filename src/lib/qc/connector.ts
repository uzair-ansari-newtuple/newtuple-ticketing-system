import { NextResponse } from "next/server";

const UUID = /^[0-9a-f-]{36}$/i;

/** The record a connector call is about. */
export async function recordIdFrom(request: Request): Promise<{ id: string; body: Record<string, unknown> } | NextResponse> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = String(body?.record_id ?? "");
  if (!UUID.test(id)) return NextResponse.json({ detail: "record_id is required" }, { status: 422 });
  return { id, body: body ?? {} };
}
