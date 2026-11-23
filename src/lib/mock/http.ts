import { NextResponse } from "next/server";
import { isSuperAdmin, userFromToken, type AppUser } from "@/lib/sm/identity";

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

/**
 * For work that belongs to a store: the user, or the error to send back. It says what is actually wrong:
 * not signed in (401), no store on the account (409), or the store could not be looked up just now (503).
 */
export function requireStore(user: AppUser | null): { user: AppUser & { store_id: string }; error: null } | { user: null; error: NextResponse } {
  if (!user || (user.role !== "store" && !isSuperAdmin(user))) return { user: null, error: jsonError(401, "Could not validate credentials") };
  if (user.store_id) return { user: user as AppUser & { store_id: string }, error: null };
  if (user.store_status === "unavailable") return { user: null, error: jsonError(503, "We could not look up your store right now. Try again in a moment.") };
  return { user: null, error: jsonError(409, "No store is assigned to your account. Ask an admin to add you to a store.") };
}
