"use client";

import { useIncidents } from "@/lib/queries";
import { useFlagged, useShipments } from "@/lib/qc/queries";

/** The numbers on the DC QC card of the home screen. They are undefined until loaded. */
export function useQcSummary() {
  const shipments = useShipments().data?.items;
  const flagged = useFlagged().data?.items;
  return {
    shipments: shipments?.filter((s) => s.state === "CREATED" || s.state === "IN_PROGRESS").length,
    onHold: flagged?.filter((u) => u.state === "SUPERVISOR_HOLD").length,
  };
}

/** The numbers on the Ticketing card of the home screen. */
export function useTicketSummary() {
  const items = useIncidents().data?.items;
  return {
    open: items?.filter((t) => t.state !== "COMPLETED" && t.state !== "CLOSED").length,
    updates: items?.filter((t) => t.unread).length,
  };
}
