import { NextResponse } from "next/server";
import { jsonError } from "@/lib/mock/http";
import { refresh } from "@/lib/sm/identity";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { refresh_token?: string } | null;
  if (!body?.refresh_token) return jsonError(401, "Your session expired. Sign in again.");
  try {
    const tokens = await refresh(body.refresh_token);
    return tokens ? NextResponse.json(tokens) : jsonError(401, "Your session expired. Sign in again.");
  } catch {
    return jsonError(503, "Sign in is unavailable right now. Try again shortly.");
  }
}
