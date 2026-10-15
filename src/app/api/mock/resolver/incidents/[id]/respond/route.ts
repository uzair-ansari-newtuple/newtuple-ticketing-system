import { NextResponse } from "next/server";
import { productMetadata } from "@/data/catalog";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { loadRow, saveRow } from "@/lib/mock/incidents";
import { getProductBySku } from "@/lib/sm/catalog";
import { ticketState } from "@/lib/sm/records";
import type { ResolverDecision } from "@/lib/types";

const DECISIONS: ResolverDecision[] = ["RECOMMEND", "CANT_RESOLVE", "NOT_APPAREL"];
const MAX_COMMENT = 500;

/** What the State Machine records for each decision: the trigger it fires and the fields that must be saved first. */
const OUTCOME: Record<ResolverDecision, { trigger: string; decision: string; reason?: string }> = {
  RECOMMEND: { trigger: "to_resolved", decision: "resolved" },
  NOT_APPAREL: { trigger: "to_notctmerch", decision: "unable", reason: "not_cititrends_merchandise" },
  CANT_RESOLVE: { trigger: "to_cantresolve", decision: "unable", reason: "no_match_found" },
};

export async function POST(request: Request, ctx: RouteContext<"/api/mock/resolver/incidents/[id]/respond">) {
  const user = await userFromRequest(request);
  if (user?.role !== "resolver") return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { decision?: ResolverDecision; sku?: string; comment?: string } | null;
  if (!body?.decision || !DECISIONS.includes(body.decision)) return jsonError(422, "Choose a decision");
  const comment = (body.comment ?? "").trim().slice(0, MAX_COMMENT);

  let recommended = null;
  if (body.decision === "RECOMMEND") {
    const product = body.sku ? await getProductBySku(body.sku) : null;
    if (!product) return jsonError(422, "Choose a product to recommend");
    recommended = productMetadata(product);
  } else if (!comment) {
    return jsonError(422, "Add a short comment so the store knows why");
  }

  const row = await loadRow(id, user);
  if (!row) return jsonError(404, "Ticket not found");
  if (row.current_state !== "RESOLUTION_IN_PROGRESS" || row.resolver?.claimed_by !== user.id) return jsonError(409, "Claim this ticket before responding");
  const outcome = OUTCOME[body.decision];
  if ((await ticketState(id)).state !== "INPROGRESS") return jsonError(409, "This ticket is not in a state that can take that answer");

  const resolver = { ...row.resolver, status: "RESOLVED" as const, decision: body.decision, recommended, comment: comment || null, responded_at: new Date().toISOString() };
  await saveRow(row, { resolver, current_state: "RESOLVER_RESPONSE_RECEIVED", unread_for_store: true }, {
    board: {
      resolver_decision: outcome.decision,
      resolver_comment: comment || undefined,
      resolver_lane_state: "RESOLVED",
      ...(outcome.reason ? { resolver_reason_codes: outcome.reason } : { selected_candidate: body.sku }),
    },
    event: { type: "RESOLVED", actor: user.name, detail: { decision: body.decision, sku: body.sku ?? null } },
    trigger: outcome.trigger,
  });
  return NextResponse.json({ state: "RESOLVER_RESPONSE_RECEIVED", resolver });
}
