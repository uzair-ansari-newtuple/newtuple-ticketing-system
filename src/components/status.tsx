import { Badge } from "@/components/ui/badge";
import type { Disposition, EscalationReason, Gating, IncidentState, ResolverDecision } from "@/lib/types";

type Variant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning";

export interface StatusInput {
  state: IncidentState;
  resolver_decision: ResolverDecision | null;
  disposition?: Disposition | null;
}

const DISPOSITION_LABEL: Record<Disposition, string> = { DISCARD: "Discarded", RETURN_TO_VENDOR: "Returned to vendor", DONATE: "Donated" };
export const dispositionLabel = (d: Disposition) => DISPOSITION_LABEL[d];

/** Status names follow the CitiTrends inbox: In-Review, Resolved, Can't Resolve, Not CT Merch, Completed. */
export function statusOf(s: StatusInput): { label: string; variant: Variant } {
  switch (s.state) {
    case "METADATA_PENDING":
      return { label: "Analyzing", variant: "secondary" };
    case "CANDIDATES_READY":
      return { label: "Review match", variant: "default" };
    case "ESCALATED":
    case "RESOLUTION_IN_PROGRESS":
      return { label: "In-Review", variant: "warning" };
    case "RESOLVER_RESPONSE_RECEIVED":
      if (s.resolver_decision === "NOT_APPAREL") return { label: "Not CT Merch", variant: "warning" };
      if (s.resolver_decision === "CANT_RESOLVE") return { label: "Can't Resolve", variant: "warning" };
      return { label: "Resolved", variant: "success" };
    case "CONFIRMED":
      return { label: "Ready to print", variant: "default" };
    case "PRINTED":
      return { label: "Tag printed", variant: "success" };
    case "COMPLETED":
      return { label: "Completed", variant: "success" };
    case "CLOSED":
      return { label: s.disposition ? DISPOSITION_LABEL[s.disposition] : "Closed", variant: "secondary" };
    case "FAILED":
      return { label: "Needs help", variant: "destructive" };
  }
}

const GATING: Record<Gating, { label: string; variant: Variant }> = {
  GREEN: { label: "Strong match", variant: "success" },
  YELLOW: { label: "Choose the item", variant: "warning" },
  RED: { label: "Blocked", variant: "destructive" },
};

export const REASONS: Record<EscalationReason, { label: string; description: string }> = {
  BARCODE_NOT_FOUND: { label: "Barcode not in the catalog", description: "The barcode is valid but we don't have this item." },
  TOO_MANY_CANDIDATES: { label: "Too many similar items", description: "Several items look right and I can't tell which." },
  LOW_EVIDENCE: { label: "Not enough to identify it", description: "The photos don't give enough to find the item." },
  CATALOG_UNAVAILABLE: { label: "Analysis unavailable", description: "The image analysis or catalog could not run." },
  USER_UNSURE: { label: "I'm not sure", description: "I'm not confident this is the right item." },
  PRINT_FAILURE: { label: "The label won't print", description: "Printing failed and I need help." },
  OTHER: { label: "Something else", description: "Tell the resolver what's wrong." },
};

export function StateBadge({ s }: { s: StatusInput }) {
  const { label, variant } = statusOf(s);
  return <Badge variant={variant}>{label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: "HIGH" | "LOW" | null }) {
  if (!priority) return null;
  return <Badge variant={priority === "HIGH" ? "destructive" : "outline"}>{priority === "HIGH" ? "High" : "Low"}</Badge>;
}

export function GatingBadge({ gating }: { gating: Gating }) {
  const { label, variant } = GATING[gating];
  return <Badge variant={variant}>{label}</Badge>;
}
