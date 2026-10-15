import { getRow, saveRow } from "@/lib/mock/incidents";
import { getProductBySku, getProductByUpc } from "./catalog";
import { getRecord, ticketState } from "./records";
import type { ResolverDecision, ResolverState } from "@/lib/types";
import { sendLabel } from "@/lib/mock/printing";
import { productMetadata } from "@/data/catalog";
import { isValidGtin, normalizeGtin } from "@/lib/taxonomy";

const GTIN_LENGTHS = [8, 12, 13, 14];
const NOTIFY_EVENTS = ["TICKET_ESCALATED", "RESOLUTION_SENT", "L2_ESCALATED", "NEW_COMMENT"] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];
export const isNotifyEvent = (value: unknown): value is NotifyEvent => NOTIFY_EVENTS.includes(value as NotifyEvent);

/** Looks a product up by its barcode, as the resolver desk does against the warehouse product table. */
export async function lookupGtin(rawGtin: string) {
  const gtin = normalizeGtin(rawGtin.replace(/[\s-]/g, ""));
  if (!GTIN_LENGTHS.includes(gtin.length) || !/^\d+$/.test(gtin)) return { status: 422, body: { detail: "GTIN must be 8, 12, 13 or 14 digits" } };
  if (!isValidGtin(gtin)) return { status: 422, body: { detail: "That barcode has an invalid check digit" } };
  const product = await getProductByUpc(gtin);
  return {
    status: 200,
    body: { ok: true, found: Boolean(product), gtin, sku: product?.sku ?? "", product: product ? productMetadata(product) : null, product_json: product ? JSON.stringify(productMetadata(product)) : "" },
  };
}

/** Prints the confirmed label for a ticket. The count of items on the ticket sets the default number of copies. */
export async function printLabelFor(incidentId: string, printer?: number, copies?: number) {
  const row = await getRow(incidentId);
  if (!row) return { status: 404, body: { detail: "Ticket not found" } };
  const result = await sendLabel(row, { printer: printer ?? 1, copies: copies ?? row.missing_price_tag_count, actor: "state-machine" });
  if (!result.ok) return { status: result.status, body: { detail: result.detail } };
  return { status: 200, body: result };
}

/** Records a push notification for a ticket. This is a stand-in for the real push service. */
export async function notifyFor(incidentId: string, event: NotifyEvent, message?: string) {
  const row = await getRow(incidentId);
  if (!row) return { status: 404, body: { detail: "Ticket not found" } };
  // A store that resolved its own ticket needs no message about it.
  if (event === "RESOLUTION_SENT" && !row.resolver?.decision && ["CONFIRMED", "PRINTED", "COMPLETED"].includes(row.current_state)) return { status: 200, body: { ok: true, delivered: false, channel: "mock-push", event, reason: "resolved by the store" } };
  await saveRow(row, {}, { event: { type: "NOTIFIED", actor: "state-machine", detail: { event, message: message ?? null } } });
  return { status: 200, body: { ok: true, delivered: true, channel: "mock-push", event } };
}

const DECIDED: Record<string, ResolverDecision> = { RESOLVED: "RECOMMEND", NOT_CT_MERCH: "NOT_APPAREL", CANT_RESOLVE: "CANT_RESOLVE" };
const SETTLED = ["RESOLVER_RESPONSE_RECEIVED", "CONFIRMED", "PRINTED", "COMPLETED", "CLOSED"];

/**
 * Brings the store's view of a ticket in line with what a resolver did in the State Machine itself: claiming it, answering it, or handing it back.
 * Safe to call again, and does nothing for tickets the app already moved on.
 */
export async function syncResolver(incidentId: string) {
  const row = await getRow(incidentId);
  if (!row) return { status: 404, body: { detail: "Ticket not found" } };
  const { state } = await ticketState(incidentId);
  const data = (await getRecord(incidentId))?.data ?? {};
  const text = (key: string) => String(data[key] ?? "").trim();
  const actor = text("resolver_name") || "state-machine";
  const base: ResolverState = row.resolver ?? { status: "NEW", claimed_by: null, decision: null, recommended: null, comment: null, responded_at: null };

  if (state === "INPROGRESS" && !SETTLED.includes(row.current_state) && row.current_state !== "RESOLUTION_IN_PROGRESS") {
    const resolver = { ...base, status: "IN_PROGRESS" as const, claimed_by: text("resolver_id") || "state-machine" };
    await saveRow(row, { resolver, current_state: "RESOLUTION_IN_PROGRESS" }, { board: { resolver_lane_state: "IN_PROGRESS" }, event: { type: "CLAIMED", actor } });
    return { status: 200, body: { ok: true, synced: "claimed" } };
  }

  if (state === "NEW" && row.current_state === "RESOLUTION_IN_PROGRESS") {
    await saveRow(row, { resolver: { ...base, status: "NEW", claimed_by: null }, current_state: "ESCALATED" }, { board: { resolver_lane_state: "NEW" }, event: { type: "RELEASED", actor } });
    return { status: 200, body: { ok: true, synced: "released" } };
  }

  const decision = DECIDED[state];
  if (decision && !SETTLED.includes(row.current_state)) {
    const sku = text("selected_candidate");
    const product = decision === "RECOMMEND" ? ((await getProductBySku(sku)) ?? (await getProductByUpc(sku))) : null;
    const comment = text("resolver_comment") || (decision === "RECOMMEND" ? "" : text("resolver_reason_codes").replaceAll("_", " "));
    const resolver: ResolverState = { ...base, status: "RESOLVED", decision, recommended: product ? productMetadata(product) : null, comment: comment || null, responded_at: new Date().toISOString() };
    await saveRow(row, { resolver, current_state: "RESOLVER_RESPONSE_RECEIVED", unread_for_store: true }, {
      board: { resolver_lane_state: "RESOLVED" },
      event: { type: "RESOLVED", actor, detail: { decision, sku: sku || null, via: "state-machine" } },
    });
    await notifyFor(incidentId, "RESOLUTION_SENT");
    return { status: 200, body: { ok: true, synced: "resolved", decision, found: decision !== "RECOMMEND" || Boolean(product) } };
  }
  return { status: 200, body: { ok: true, synced: "nothing to do", state } };
}
