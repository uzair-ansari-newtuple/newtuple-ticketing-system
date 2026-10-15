import { Badge } from "@/components/ui/badge";
import type { LineStatus, PoStatus } from "@/lib/qc/types";

export function PoStatusBadge({ status }: { status: PoStatus }) {
  if (status === "COMPLETE") return <Badge variant="success">QC complete</Badge>;
  if (status === "IN_PROGRESS") return <Badge variant="warning">QC in progress</Badge>;
  return <Badge variant="secondary">Ready for QC</Badge>;
}

export function LineStatusBadge({ status }: { status: LineStatus }) {
  if (status === "VERIFIED") return <Badge variant="success">Verified</Badge>;
  if (status === "EXCEPTION") return <Badge variant="destructive">Exception</Badge>;
  return <Badge variant="secondary">To verify</Badge>;
}
