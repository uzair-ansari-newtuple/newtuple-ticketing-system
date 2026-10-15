import { NextResponse } from "next/server";
import { jsonError } from "@/lib/mock/http";
import { signIn } from "@/lib/sm/identity";
import type { LoginResponse } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  if (!body?.email?.trim() || !body.password) return jsonError(401, "Invalid email or password");
  let result;
  try {
    result = await signIn(body.email.trim(), body.password);
  } catch {
    return jsonError(503, "Sign in is unavailable right now. Try again shortly.");
  }
  if (!result.ok) return jsonError(result.status, result.detail);
  const response: LoginResponse = { access_token: result.tokens.access_token, refresh_token: result.tokens.refresh_token, token_type: "bearer", user: result.user };
  return NextResponse.json(response);
}
