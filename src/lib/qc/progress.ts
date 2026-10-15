import type { PoProgress, PurchaseOrder } from "./types";

export function poSummary(po: PurchaseOrder, progress: PoProgress | undefined) {
  const results = progress?.results ?? {};
  const verified = po.lines.filter((l) => results[l.upc]?.status === "VERIFIED").length;
  const exceptions = po.lines.filter((l) => results[l.upc]?.status === "EXCEPTION").length;
  const handled = verified + exceptions;
  return {
    total: po.lines.length,
    verified,
    exceptions,
    handled,
    pending: po.lines.length - handled,
    units: po.lines.reduce((sum, l) => sum + l.expectedQty, 0),
    received: po.lines.reduce((sum, l) => sum + (results[l.upc]?.receivedQty ?? 0), 0),
    percent: po.lines.length ? Math.round((handled / po.lines.length) * 100) : 0,
    openExceptions: po.lines.filter((l) => results[l.upc]?.exception && !results[l.upc]?.exception?.resolution).length,
  };
}
