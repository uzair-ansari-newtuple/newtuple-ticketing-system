import { NextResponse } from "next/server";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import type { AppUser } from "@/lib/sm/identity";
import { SmError } from "@/lib/sm/client";
import { QcError } from "./service";

async function readJson(request: Request): Promise<Record<string, unknown>> {
  return ((await request.json().catch(() => null)) as Record<string, unknown> | null) ?? {};
}

/** Runs a DC QC handler for a signed-in user and turns its errors into the JSON the app expects. */
export async function qcHandler(request: Request, run: (body: Record<string, unknown>, user: AppUser) => Promise<unknown>, status = 200) {
  const user = await userFromRequest(request);
  if (!user) return jsonError(401, "Could not validate credentials");
  try {
    const body = request.method === "GET" ? {} : await readJson(request);
    return NextResponse.json(await run(body, user), { status });
  } catch (err) {
    if (err instanceof QcError) return jsonError(err.status, err.message);
    if (err instanceof SmError) {
      console.error("DC QC call to the State Machine failed", err);
      if (err.status === 400 || err.status === 422) return jsonError(409, "The State Machine did not accept that step");
      // Say what failed. "Could not be reached" is only true for a connection problem, not for a 404 or a refusal.
      const cause = err.status === 404 ? "it could not find what was asked for" : err.status === 401 || err.status === 403 ? "it refused the app's access" : `it answered ${err.status}`;
      return jsonError(502, `The State Machine could not complete that: ${cause} (${err.message.slice(0, 120)})`);
    }
    throw err;
  }
}
