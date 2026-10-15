import { NextResponse } from "next/server";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { MIN_PRINT_SCORE } from "@/lib/mock/flow";
import { parseItemCount } from "@/lib/mock/item-count";
import { loadRow, saveRow } from "@/lib/mock/incidents";
import type { Candidate } from "@/lib/types";

export async function POST(request: Request, ctx: RouteContext<"/api/mock/incidents/[id]/confirm">) {
  const user = await userFromRequest(request);
  if (user?.role !== "store") return jsonError(401, "Could not validate credentials");
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { candidate_key?: string; acknowledged?: boolean; missing_price_tag_count?: number } | null;
  if (body?.acknowledged !== true) return jsonError(422, "Confirm that this is the right item before continuing");
  const count = body.missing_price_tag_count === undefined ? null : parseItemCount(body.missing_price_tag_count);
  if (body.missing_price_tag_count !== undefined && count === null) return jsonError(422, "Item count must be a whole number from 1 to 99");

  const row = await loadRow(id, user);
  if (!row) return jsonError(404, "Ticket not found");

  let selected: Candidate | null = null;
  if (row.current_state === "CANDIDATES_READY") {
    if (row.gating === "RED") return jsonError(422, "Matches are too uncertain to print. Request assistance instead.");
    selected = row.candidates.find((c) => c.key === body.candidate_key) ?? null;
    if (!selected) return jsonError(422, "Choose one of the suggested items");
    if (selected.score < MIN_PRINT_SCORE) return jsonError(422, `Confidence is below ${Math.round(MIN_PRINT_SCORE * 100)}%. Request assistance instead.`);
  } else if (row.current_state === "RESOLVER_RESPONSE_RECEIVED" && row.resolver?.decision === "RECOMMEND" && row.resolver.recommended) {
    const rec = row.resolver.recommended;
    selected = { key: rec.Sku ?? "resolver", sku: rec.Sku, metadata: rec, score: 1, evidence: "barcode", thumb: null };
  } else {
    return jsonError(409, "This ticket cannot be confirmed in its current state");
  }

  await saveRow(
    row,
    { selected, current_state: "CONFIRMED", unread_for_store: false, ...(count ? { missing_price_tag_count: count } : {}) },
    { event: { type: "CONFIRMED", actor: user.name, detail: { sku: selected.sku, score: selected.score } } },
  );
  return NextResponse.json({ state: "CONFIRMED", selected });
}
