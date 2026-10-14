import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { findUserByEmail, signToken, verifyLogin, type DbUser } from "@/lib/mock/auth";
import { jsonError } from "@/lib/mock/http";
import { smLoginEnabled, smSignIn } from "@/lib/sm/client";
import type { LoginResponse } from "@/lib/types";

export function GET() {
  return NextResponse.json({ provider: smLoginEnabled() ? "state-machine" : "local" });
}

async function authenticate(identifier: string, password: string): Promise<DbUser | Response> {
  if (!smLoginEnabled()) return (await verifyLogin(getPool(), identifier, password)) ?? jsonError(401, "Invalid username or password");
  let result;
  try {
    result = await smSignIn(identifier, password);
  } catch {
    return jsonError(503, "Sign in is unavailable right now. Try again shortly.");
  }
  if (!result.ok) return jsonError(result.status === 401 ? 401 : result.status, result.detail);
  return (await findUserByEmail(getPool(), result.email)) ?? jsonError(403, "This account is not set up for the ticketing app yet. Ask an admin to add you.");
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: string; password?: string } | null;
  if (!body?.username || !body.password) return jsonError(401, "Invalid username or password");
  const user = await authenticate(body.username.trim(), body.password);
  if (user instanceof Response) return user;

  const response: LoginResponse = {
    access_token: signToken(user.id),
    token_type: "bearer",
    user: { id: user.id, username: user.username, role: user.role, store_id: user.store_id, store_name: user.store_name },
  };
  return NextResponse.json(response);
}
