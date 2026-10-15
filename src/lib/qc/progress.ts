import type { ShipmentTotals } from "./dto";

export const percentDone = (t: ShipmentTotals) => (t.upcs ? Math.round(((t.approved + t.wont_qc) / t.upcs) * 100) : 0);
