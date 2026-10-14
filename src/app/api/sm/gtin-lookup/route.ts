import { NextResponse } from "next/server";
import { lookupGtin } from "@/lib/sm/actions";
import { authorizeConnector } from "@/lib/sm/stages";

export async function POST(request: Request) {
  const denied = authorizeConnector(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { gtin?: string | number } | null;
  // The State Machine sends a digits-only value as a number.
  const gtin = body?.gtin === undefined || body.gtin === null ? "" : String(body.gtin).trim();
  if (!gtin) return NextResponse.json({ detail: "gtin is required" }, { status: 422 });
  const result = await lookupGtin(gtin);
  return NextResponse.json(result.body, { status: result.status });
}
