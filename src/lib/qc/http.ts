import { NextResponse } from "next/server";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { SmError } from "@/lib/sm/client";
import { QcError } from "./service";

async function readJson(request: Request): Promise<Record<string, unknown>> {
  return ((await request.json().catch(() => null)) as Record<string, unknown> | null) ?? {};
}

/** Runs a DC QC handler for a signed-in user and turns its errors into the JSON the app expects. */
export async function qcHandler(request: Request, run: (body: Record<string, unknown>) => Promise<unknown>, status = 200) {
  if (!(await userFromRequest(request))) return jsonError(401, "Could not validate credentials");
  try {
    const body = request.method === "GET" ? {} : await readJson(request);
    return NextResponse.json(await run(body), { status });
  } catch (err) {
    if (err instanceof QcError) return jsonError(err.status, err.message);
    if (err instanceof SmError) {
      console.error("DC QC call to the State Machine failed", err);
      return jsonError(err.status === 400 || err.status === 422 ? 409 : 502, err.status === 400 || err.status === 422 ? "The State Machine did not accept that step" : "The State Machine could not be reached");
    }
    throw err;
  }
}
