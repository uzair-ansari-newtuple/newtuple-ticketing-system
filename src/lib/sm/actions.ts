import { getPool } from "@/lib/db";
import { logEvent, type IncidentRow } from "@/lib/mock/incidents";
import { getProductByUpc } from "@/lib/mock/products";
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
  const product = await getProductByUpc(getPool(), gtin);
  return {
    status: 200,
    body: { ok: true, found: Boolean(product), gtin, sku: product?.sku ?? "", product: product ? productMetadata(product) : null, product_json: product ? JSON.stringify(productMetadata(product)) : "" },
  };
}

async function loadIncident(id: string): Promise<IncidentRow | null> {
  const { rows } = await getPool().query<IncidentRow>(`SELECT * FROM incidents WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/** Prints the confirmed label for a ticket. The count of items on the ticket sets the default number of copies. */
export async function printLabelFor(incidentId: string, printer?: number, copies?: number) {
  const row = await loadIncident(incidentId);
  if (!row) return { status: 404, body: { detail: "Ticket not found" } };
  const result = await sendLabel(getPool(), row, { printer: printer ?? 1, copies: copies ?? row.missing_price_tag_count, actor: "state-machine" });
  if (!result.ok) return { status: result.status, body: { detail: result.detail } };
  return { status: 200, body: result };
}

/** Records a push notification for a ticket. This is a stand-in for the real push service. */
export async function notifyFor(incidentId: string, event: NotifyEvent, message?: string) {
  const row = await loadIncident(incidentId);
  if (!row) return { status: 404, body: { detail: "Ticket not found" } };
  await logEvent(getPool(), incidentId, "NOTIFIED", "state-machine", { event, message: message ?? null });
  return { status: 200, body: { ok: true, delivered: true, channel: "mock-push", event } };
}
