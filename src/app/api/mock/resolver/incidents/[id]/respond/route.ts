import { NextResponse } from "next/server";
import { productMetadata } from "@/data/catalog";
import { getPool } from "@/lib/db";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { loadRow, logEvent } from "@/lib/mock/incidents";
import { getProductBySku } from "@/lib/mock/products";
import type { ResolverDecision } from "@/lib/types";
import { mirror } from "@/lib/sm/mirror";

const DECISIONS: ResolverDecision[] = ["RECOMMEND", "CANT_RESOLVE", "NOT_APPAREL"];
const MAX_COMMENT = 500;

export async function POST(request: Request, ctx: RouteContext<"/api/mock/resolver/incidents/[id]/respond">) {
  const user = await userFromRequest(request);
  if (user?.role !== "resolver") return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { decision?: ResolverDecision; sku?: string; comment?: string } | null;
  if (!body?.decision || !DECISIONS.includes(body.decision)) return jsonError(422, "Choose a decision");
  const comment = (body.comment ?? "").trim().slice(0, MAX_COMMENT);

  let recommended = null;
  if (body.decision === "RECOMMEND") {
    const product = body.sku ? await getProductBySku(getPool(), body.sku) : null;
    if (!product) return jsonError(422, "Choose a product to recommend");
    recommended = productMetadata(product);
  } else if (!comment) {
    return jsonError(422, "Add a short comment so the store knows why");
  }

  const pool = getPool();
  const row = await loadRow(pool, id, user);
  if (!row) return jsonError(404, "Ticket not found");
  if (row.current_state !== "RESOLUTION_IN_PROGRESS" || row.resolver?.claimed_by !== user.username) return jsonError(409, "Claim this ticket before responding");

  const resolver = { ...row.resolver, status: "RESOLVED", decision: body.decision, recommended, comment: comment || null, responded_at: new Date().toISOString() };
  await pool.query(`UPDATE incidents SET resolver = $2, current_state = 'RESOLVER_RESPONSE_RECEIVED', unread_for_store = true, updated_at = now() WHERE id = $1`, [id, JSON.stringify(resolver)]);
  await logEvent(pool, id, "RESOLVED", user.username, { decision: body.decision, sku: body.sku ?? null });
  const common = { resolver_comment: comment || undefined, resolver_lane_state: "RESOLVED" };
  if (body.decision === "RECOMMEND") mirror(id, { ...common, resolver_decision: "resolved", selected_candidate: body.sku }, "to_resolved");
  else if (body.decision === "NOT_APPAREL") mirror(id, { ...common, resolver_decision: "unable", resolver_reason_codes: "not_cititrends_merchandise" }, "to_notctmerch");
  else mirror(id, { ...common, resolver_decision: "unable", resolver_reason_codes: "no_match_found" }, "to_cantresolve");
  return NextResponse.json({ state: "RESOLVER_RESPONSE_RECEIVED", resolver });
}
