import { NextResponse } from "next/server";
import { jsonError, storeIdFromRequest } from "@/lib/mock/http";
import { getQuality } from "@/lib/mock/quality";
import { QUALITY_DURATION_MS, progressFor } from "@/lib/mock/store";
import type { Job, QualityCheckResult } from "@/lib/types";

const RUNNING_AFTER_MS = 300;

export async function GET(request: Request, ctx: RouteContext<"/api/mock/jobs/[id]">) {
  const storeId = await storeIdFromRequest(request);
  if (!storeId) return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  const check = await getQuality(id);
  if (!check || check.store_id !== storeId) return jsonError(404, "Job not found");

  const elapsed = Date.now() - check.created_at.getTime();
  const done = elapsed >= QUALITY_DURATION_MS;
  const job: Job<QualityCheckResult> = {
    id,
    job_type: "quality_check",
    status: done ? "completed" : elapsed > RUNNING_AFTER_MS ? "running" : "pending",
    progress: progressFor(elapsed, QUALITY_DURATION_MS),
    result: done ? check.result : null,
    error_message: null,
  };
  return NextResponse.json(job);
}
