import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { findUserById, verifyToken, type DbUser } from "@/lib/mock/auth";

export function jsonError(status: number, detail: string) {
  return NextResponse.json({ detail }, { status });
}

function bearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

/** Resolves the signed-in user from the Authorization header, or null if the token is missing, forged or expired. */
export async function userFromRequest(request: Request): Promise<DbUser | null> {
  const userId = verifyToken(bearer(request));
  return userId ? findUserById(getPool(), userId) : null;
}

export async function storeIdFromRequest(request: Request): Promise<string | null> {
  const user = await userFromRequest(request);
  return user?.role === "store" ? user.store_id : null;
}
