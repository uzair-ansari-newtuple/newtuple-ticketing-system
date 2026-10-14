import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { loadRow, logEvent } from "@/lib/mock/incidents";
import { isValidGtin } from "@/lib/taxonomy";

const MAX_COPIES = 10;
const PRINTERS = [1, 2];
const DUPLICATE_WINDOW_SECONDS = 10;
const PRINTABLE = ["CONFIRMED", "PRINTED"];

export async function POST(request: Request) {
  const user = await userFromRequest(request);
  if (user?.role !== "store" || !user.store_id) return jsonError(401, "Could not validate credentials");
  const body = (await request.json().catch(() => null)) as { incident_id?: string; printer?: number; copies?: number } | null;
  const printer = Number(body?.printer);
  const copies = Number(body?.copies);
  if (!PRINTERS.includes(printer)) return jsonError(422, "Choose printer 1 or 2");
  if (!Number.isInteger(copies) || copies < 1 || copies > MAX_COPIES) return jsonError(422, `Copies must be between 1 and ${MAX_COPIES}`);

  const pool = getPool();
  const row = body?.incident_id ? await loadRow(pool, body.incident_id, user) : null;
  if (!row) return jsonError(404, "Ticket not found");
  if (!PRINTABLE.includes(row.current_state) || !row.selected) return jsonError(409, "Confirm the item before printing");
  const upc = row.selected.metadata.Barcode;
  if (!upc || !isValidGtin(upc)) return jsonError(422, "This item has no valid barcode to print");

  const recent = await pool.query(
    `SELECT 1 FROM print_jobs WHERE incident_id = $1 AND upc = $2 AND status = 'accepted' AND created_at > now() - make_interval(secs => $3) LIMIT 1`,
    [row.id, upc, DUPLICATE_WINDOW_SECONDS],
  );
  if (recent.rowCount) return jsonError(409, "A label for this item was just printed. Wait a few seconds before printing again.");

  const jobId = randomUUID();
  const message = "Label sent to the printer";
  await pool.query(
    `INSERT INTO print_jobs (id, incident_id, store_id, upc, sku, printer, copies, status, message) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [jobId, row.id, user.store_id, upc, row.selected.sku, printer, copies, "accepted", message],
  );
  await logEvent(pool, row.id, "PRINTED", user.username, { printer, copies, upc });

  await pool.query(`UPDATE incidents SET current_state = 'PRINTED', updated_at = now() WHERE id = $1`, [row.id]);
  return NextResponse.json({ request_id: jobId, queued: true, message, printer, copies, upc });
}
