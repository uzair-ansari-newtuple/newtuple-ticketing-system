import { NextResponse } from "next/server";
import { endSession, forgetToken } from "@/lib/sm/identity";

export const dynamic = "force-dynamic";

/** Signs the user out on the server: forgets the cached user and ends the State Machine session. Always answers 204; there is nothing useful to tell a client that is leaving. */
export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  forgetToken(header.startsWith("Bearer ") ? header.slice(7) : "");
  const body = (await request.json().catch(() => null)) as { refresh_token?: string } | null;
  await endSession(body?.refresh_token ?? "");
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
