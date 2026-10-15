import { randomUUID } from "node:crypto";
import { saveRow, type IncidentRow } from "@/lib/mock/incidents";
import { isValidGtin } from "@/lib/taxonomy";
import type { PrintJob } from "@/lib/types";

export const MAX_COPIES = 99;
export const PRINTERS = [1, 2];
const DUPLICATE_WINDOW_MS = 10_000;
const PRINTABLE = ["CONFIRMED", "PRINTED"];

export type PrintResult = { ok: true; request_id: string; queued: true; message: string; printer: number; copies: number; upc: string } | { ok: false; status: number; detail: string };

/** Sends a label to the (simulated) printer for a confirmed ticket and records the job on the ticket. */
export async function sendLabel(row: IncidentRow, input: { printer: number; copies: number; actor: string }): Promise<PrintResult> {
  const { printer, copies, actor } = input;
  if (!PRINTERS.includes(printer)) return { ok: false, status: 422, detail: "Choose printer 1 or 2" };
  if (!Number.isInteger(copies) || copies < 1 || copies > MAX_COPIES) return { ok: false, status: 422, detail: `Copies must be between 1 and ${MAX_COPIES}` };
  if (!PRINTABLE.includes(row.current_state) || !row.selected) return { ok: false, status: 409, detail: "Confirm the item before printing" };
  const upc = row.selected.metadata.Barcode;
  if (!upc || !isValidGtin(upc)) return { ok: false, status: 422, detail: "This item has no valid barcode to print" };

  const recent = row.print_jobs.some((p) => p.upc === upc && p.status === "accepted" && Date.now() - Date.parse(p.created_at) < DUPLICATE_WINDOW_MS);
  if (recent) return { ok: false, status: 409, detail: "A label for this item was just printed. Wait a few seconds before printing again." };

  const message = "Label sent to the printer";
  const job: PrintJob = { id: randomUUID(), printer, copies, status: "accepted", message, upc, created_at: new Date().toISOString() };
  await saveRow(row, { print_jobs: [...row.print_jobs, job], current_state: "PRINTED" }, { event: { type: "PRINTED", actor, detail: { printer, copies, upc } } });
  return { ok: true, request_id: job.id, queued: true, message, printer, copies, upc };
}
