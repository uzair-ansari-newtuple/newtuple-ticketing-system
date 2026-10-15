import { Badge } from "@/components/ui/badge";
import type { LineState, PoState } from "@/lib/qc/dto";

export function PoStatusBadge({ state }: { state: PoState }) {
  if (state === "QC_COMPLETE") return <Badge variant="success">QC complete</Badge>;
  if (state === "EXCEPTIONS_OPEN") return <Badge variant="destructive">Exceptions open</Badge>;
  if (state === "QC_IN_PROGRESS") return <Badge variant="warning">QC in progress</Badge>;
  return <Badge variant="secondary">Ready for QC</Badge>;
}

export function LineStatusBadge({ state }: { state: LineState }) {
  if (state === "VERIFIED") return <Badge variant="success">Verified</Badge>;
  if (state === "EXCEPTION") return <Badge variant="destructive">Exception</Badge>;
  if (state === "EXCEPTION_RESOLVED") return <Badge variant="success">Resolved</Badge>;
  if (state === "COUNT_MISMATCH") return <Badge variant="warning">Count off</Badge>;
  if (state === "COUNT_CHECK") return <Badge variant="secondary">Checking…</Badge>;
  return <Badge variant="secondary">To verify</Badge>;
}
