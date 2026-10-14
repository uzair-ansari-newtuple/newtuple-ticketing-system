import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { signToken, verifyLogin } from "@/lib/mock/auth";
import { jsonError } from "@/lib/mock/http";
import type { LoginResponse } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: string; password?: string } | null;
  if (!body?.username || !body.password) return jsonError(401, "Invalid username or password");
  const user = await verifyLogin(getPool(), body.username, body.password);
  if (!user) return jsonError(401, "Invalid username or password");

  const response: LoginResponse = {
    access_token: signToken(user.id),
    token_type: "bearer",
    user: { id: user.id, username: user.username, role: user.role, store_id: user.store_id, store_name: user.store_name },
  };
  return NextResponse.json(response);
}
