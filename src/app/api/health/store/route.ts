import { NextResponse } from "next/server";
import { SmError, smFetch } from "@/lib/sm/client";

export const dynamic = "force-dynamic";

/**
 * Checks the one thing every store-bound action depends on: that the app's service account can read store assignments.
 * Safe to call without signing in. It reveals only a count, never who is assigned where.
 */
export async function GET() {
  try {
    const found = await smFetch<{ items?: unknown[]; total?: number }>("GET", "/entity-records?entity_type_name=store_assignment&limit=1");
    return NextResponse.json({ ok: true, can_read_store_assignments: true, has_assignments: (found.items ?? []).length > 0 });
  } catch (e) {
    const why = e instanceof SmError ? (e.status === 401 ? "the service account could not sign in" : e.status === 403 ? "the service account is not allowed to read store assignments" : e.status === 404 ? "the store_assignment entity type does not exist" : `the State Machine answered ${e.status}`) : "the State Machine is unreachable";
    return NextResponse.json({ ok: false, can_read_store_assignments: false, error: `Store lookups will fail: ${why}.` }, { status: 503 });
  }
}
