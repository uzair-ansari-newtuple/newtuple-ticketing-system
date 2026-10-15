import type { QcTotals } from "./dto";

export const percentDone = (t: QcTotals) => (t.lines ? Math.round(((t.lines - t.pending) / t.lines) * 100) : 0);

