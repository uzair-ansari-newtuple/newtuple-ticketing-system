import type { IncidentSummary } from "@/lib/types";

export type InboxTab = "all" | "in_review" | "resolved" | "completed" | "unresolvable" | "unread";

export const INBOX_TABS: { key: InboxTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "in_review", label: "In review" },
  { key: "resolved", label: "Resolved" },
  { key: "completed", label: "Completed" },
  { key: "unresolvable", label: "Unresolvable" },
  { key: "unread", label: "Unread" },
];

/** Same grouping as the CitiTrends inbox. Tickets still being worked by the associate only appear under All. */
export function inTab(t: IncidentSummary, tab: InboxTab): boolean {
  switch (tab) {
    case "all":
      return true;
    case "in_review":
      return t.state === "ESCALATED" || t.state === "RESOLUTION_IN_PROGRESS";
    case "resolved":
      return (t.state === "RESOLVER_RESPONSE_RECEIVED" && t.resolver_decision === "RECOMMEND") || t.state === "PRINTED" || (t.state === "CONFIRMED" && t.resolver_decision === "RECOMMEND");
    case "completed":
      return t.state === "COMPLETED" || t.state === "CLOSED";
    case "unresolvable":
      return t.state === "RESOLVER_RESPONSE_RECEIVED" && t.resolver_decision !== null && t.resolver_decision !== "RECOMMEND";
    case "unread":
      return t.unread;
  }
}

export function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
