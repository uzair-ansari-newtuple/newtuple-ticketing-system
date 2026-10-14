import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { getPool } from "@/lib/db";
import { numberDisplay } from "@/lib/mock/incidents";
import { smEnabled, smEntityType, smFetch, smMachine } from "@/lib/sm/client";

type Fields = Record<string, unknown>;

const AVAILABILITY_ATTEMPTS = 10;
const AVAILABILITY_DELAY_MS = 1000;

let entityTypeId: string | null = null;

/** The State Machine stores every ticket field as a string, so objects are JSON-encoded. */
const encode = (fields: Fields): Fields =>
  Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v !== null && typeof v === "object" ? JSON.stringify(v) : v]));

async function capture(incidentId: string): Promise<string | null> {
  const { rows } = await getPool().query<{ number: number; store_id: string; image_count: number; created_at: Date; sm_entity_id: string | null }>(
    `SELECT number, store_id, image_count, created_at, sm_entity_id FROM incidents WHERE id = $1`,
    [incidentId],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.sm_entity_id) return row.sm_entity_id;

  entityTypeId ??= (await smFetch<{ entity_type_id: string }>("GET", `/entity-types/${smEntityType()}`)).entity_type_id;
  const created = await smFetch<{ entity_id: string }>("POST", "/entity-records", {
    entity_type_id: entityTypeId,
    data: encode({
      identifier: numberDisplay(row.number),
      incident_id: incidentId,
      bot_service_incident_id: incidentId,
      incident_number: row.number,
      store_id: row.store_id,
      source: "ticketing_app",
      created_at: row.created_at.toISOString(),
      submitted_at: row.created_at.toISOString(),
      resolver_lane_state: "NEW",
    }),
  });
  await smFetch("POST", `/workflow-state-machines/${smMachine()}/enrollments`, { entity_id: created.entity_id });
  await getPool().query(`UPDATE incidents SET sm_entity_id = $2 WHERE id = $1`, [incidentId, created.entity_id]);
  return created.entity_id;
}

/** A new ticket passes through its automatic early states first, so wait until the trigger is offered. */
async function waitUntilAvailable(entityId: string, trigger: string) {
  for (let attempt = 0; attempt < AVAILABILITY_ATTEMPTS; attempt++) {
    const { available_transitions } = await smFetch<{ available_transitions: { trigger: string }[] }>("GET", `/entities/${entityId}/transitions/available`);
    if (available_transitions.some((t) => t.trigger === trigger)) return;
    await new Promise((resolve) => setTimeout(resolve, AVAILABILITY_DELAY_MS));
  }
}

/** Saves the fields first and fires the trigger second, because a transition validates against saved data. */
async function sync(incidentId: string, data: Fields, trigger?: string) {
  const entityId = await capture(incidentId);
  if (!entityId) return;
  if (Object.keys(data).length) await smFetch("PUT", `/entity-records/${entityId}`, { data: encode(data) });
  if (trigger) {
    await waitUntilAvailable(entityId, trigger);
    await smFetch("POST", `/entities/${entityId}/transitions`, { entity_id: entityId, trigger, idempotency_key: randomUUID(), inputs: {} });
  }
}

/** Mirrors a ticket change into the State Machine after the response is sent. A failure is logged and never reaches the user. */
export function mirror(incidentId: string, data: Fields = {}, trigger?: string) {
  if (!smEnabled()) return;
  after(() => sync(incidentId, data, trigger).catch((err) => console.error(`[SM] ${incidentId}: ${err instanceof Error ? err.message : err}`)));
}
