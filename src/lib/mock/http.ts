import { NextResponse } from "next/server";
import { userFromToken, type AppUser } from "@/lib/sm/identity";

export function jsonError(status: number, detail: string) {
  return NextResponse.json({ detail }, { status });
}

function bearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

/** Resolves the signed-in user from the State Machine token in the Authorization header, or null if it is missing, expired or has no access. */
export async function userFromRequest(request: Request): Promise<AppUser | null> {
  return userFromToken(bearer(request));
}

export async function storeIdFromRequest(request: Request): Promise<string | null> {
  const user = await userFromRequest(request);
  return user?.role === "store" || user?.role === "superadmin" ? user.store_id : null;
}
