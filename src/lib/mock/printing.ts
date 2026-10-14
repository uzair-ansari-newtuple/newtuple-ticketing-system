import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { logEvent, type IncidentRow } from "@/lib/mock/incidents";
import { isValidGtin } from "@/lib/taxonomy";

export const MAX_COPIES = 99;
export const PRINTERS = [1, 2];
const DUPLICATE_WINDOW_SECONDS = 10;
const PRINTABLE = ["CONFIRMED", "PRINTED"];

export type PrintResult = { ok: true; request_id: string; queued: true; message: string; printer: number; copies: number; upc: string } | { ok: false; status: number; detail: string };

/** Sends a label to the (simulated) printer for a confirmed ticket and records the job. */
export async function sendLabel(pool: Pool, row: IncidentRow, input: { printer: number; copies: number; actor: string }): Promise<PrintResult> {
  const { printer, copies, actor } = input;
  if (!PRINTERS.includes(printer)) return { ok: false, status: 422, detail: "Choose printer 1 or 2" };
  if (!Number.isInteger(copies) || copies < 1 || copies > MAX_COPIES) return { ok: false, status: 422, detail: `Copies must be between 1 and ${MAX_COPIES}` };
  if (!PRINTABLE.includes(row.current_state) || !row.selected) return { ok: false, status: 409, detail: "Confirm the item before printing" };
  const upc = row.selected.metadata.Barcode;
  if (!upc || !isValidGtin(upc)) return { ok: false, status: 422, detail: "This item has no valid barcode to print" };

  const recent = await pool.query(
    `SELECT 1 FROM print_jobs WHERE incident_id = $1 AND upc = $2 AND status = 'accepted' AND created_at > now() - make_interval(secs => $3) LIMIT 1`,
    [row.id, upc, DUPLICATE_WINDOW_SECONDS],
  );
  if (recent.rowCount) return { ok: false, status: 409, detail: "A label for this item was just printed. Wait a few seconds before printing again." };

  const jobId = randomUUID();
  const message = "Label sent to the printer";
  await pool.query(
    `INSERT INTO print_jobs (id, incident_id, store_id, upc, sku, printer, copies, status, message) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [jobId, row.id, row.store_id, upc, row.selected.sku, printer, copies, "accepted", message],
  );
  await logEvent(pool, row.id, "PRINTED", actor, { printer, copies, upc });
  await pool.query(`UPDATE incidents SET current_state = 'PRINTED', updated_at = now() WHERE id = $1`, [row.id]);
  return { ok: true, request_id: jobId, queued: true, message, printer, copies, upc };
}
