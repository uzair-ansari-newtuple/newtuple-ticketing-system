import { NextResponse } from "next/server";
import { smFetch } from "@/lib/sm/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await smFetch("GET", "/auth/me");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "State Machine unreachable" }, { status: 503 });
  }
}
