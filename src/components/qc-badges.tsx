import { Badge } from "@/components/ui/badge";
import type { PalletStatus, ShipmentState, UpcState } from "@/lib/qc/dto";

export function ShipmentBadge({ state }: { state: ShipmentState }) {
  if (state === "CLOSED") return <Badge variant="success">Receipt closed</Badge>;
  if (state === "RECEIPT_IN_PROGRESS") return <Badge variant="warning">Receipt in progress</Badge>;
  if (state === "QC_COMPLETE") return <Badge variant="success">QC complete</Badge>;
  if (state === "IN_PROGRESS") return <Badge variant="warning">QC in progress</Badge>;
  return <Badge variant="secondary">Ready for QC</Badge>;
}

export function UpcBadge({ state }: { state: UpcState }) {
  if (state === "APPROVED") return <Badge variant="success">Approved</Badge>;
  if (state === "SUPERVISOR_HOLD") return <Badge variant="destructive">On hold</Badge>;
  if (state === "WONT_QC") return <Badge variant="secondary">Won&apos;t QC</Badge>;
  if (state === "IN_PROGRESS") return <Badge variant="warning">In progress</Badge>;
  return <Badge variant="secondary">To check</Badge>;
}

export function PalletBadge({ status }: { status: PalletStatus }) {
  if (status === "COMPLETE") return <Badge variant="success">Counted</Badge>;
  if (status === "IN_PROGRESS") return <Badge variant="warning">In progress</Badge>;
  return <Badge variant="secondary">To check</Badge>;
}
