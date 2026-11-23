import { NextResponse } from "next/server";
import { jsonError, userFromRequest } from "@/lib/mock/http";

export const dynamic = "force-dynamic";

/** Who the State Machine says the signed-in user is right now, store included. The app calls this so a saved sign-in never keeps an old store. */
export async function GET(request: Request) {
  const user = await userFromRequest(request);
  return user ? NextResponse.json({ user }) : jsonError(401, "Could not validate credentials");
}
