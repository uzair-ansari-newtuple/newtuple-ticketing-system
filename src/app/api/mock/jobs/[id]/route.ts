import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { jsonError, storeIdFromRequest } from "@/lib/mock/http";
import { QUALITY_DURATION_MS, progressFor } from "@/lib/mock/store";
import type { Job, QualityCheckResult } from "@/lib/types";

const RUNNING_AFTER_MS = 300;

export async function GET(request: Request, ctx: RouteContext<"/api/mock/jobs/[id]">) {
  const storeId = await storeIdFromRequest(request);
  if (!storeId) return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError(404, "Job not found");

  const { rows } = await getPool().query<{ result: QualityCheckResult; elapsed_ms: string }>(
    `SELECT result, EXTRACT(EPOCH FROM (now() - created_at)) * 1000 AS elapsed_ms FROM quality_checks WHERE id = $1 AND store_id = $2`,
    [id, storeId],
  );
  if (!rows[0]) return jsonError(404, "Job not found");

  const elapsed = Number(rows[0].elapsed_ms);
  const done = elapsed >= QUALITY_DURATION_MS;
  const job: Job = {
    id,
    job_type: "quality_check",
    status: done ? "completed" : elapsed > RUNNING_AFTER_MS ? "running" : "pending",
    progress: progressFor(elapsed, QUALITY_DURATION_MS),
    result: done ? rows[0].result : null,
    error_message: null,
  };
  return NextResponse.json(job);
}
