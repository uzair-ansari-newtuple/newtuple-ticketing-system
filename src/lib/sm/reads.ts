import { smEnabled, smEntityType, smFetch, smMachine } from "@/lib/sm/client";
import type { ResolverState } from "@/lib/types";

const PAGE_SIZE = 200;
const AUTOMATIC_STATES = ["CAPTURED", "IMAGE_MAPPED", "AI_IDENTIFICATION"];

const LANE: Record<string, ResolverState["status"]> = {
  NEW: "NEW",
  NEEDS_L2: "NEW",
  INPROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
  NOT_CT_MERCH: "RESOLVED",
  CANT_RESOLVE: "RESOLVED",
};

type Enrollment = { current_state: string; summary_fields: { bot_service_incident_id?: string } };

/** Resolver lane of each ticket according to the State Machine, keyed by the app's ticket id. Null when the State Machine cannot be read. */
export async function smResolverLanes(): Promise<Map<string, ResolverState["status"]> | null> {
  if (!smEnabled()) return null;
  try {
    const query = new URLSearchParams({
      machine_name: smMachine(),
      entity_type_name: smEntityType(),
      exclude_states: AUTOMATIC_STATES.join(","),
      fields: "bot_service_incident_id",
      limit: String(PAGE_SIZE),
    });
    const { items } = await smFetch<{ items: Enrollment[] }>("GET", `/workflow-enrollments?${query}`);
    const lanes = new Map<string, ResolverState["status"]>();
    for (const item of items) {
      const id = item.summary_fields.bot_service_incident_id;
      const lane = LANE[item.current_state];
      if (id && lane) lanes.set(id, lane);
    }
    return lanes;
  } catch (err) {
    console.error(`[SM] queue read failed, using local data: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
