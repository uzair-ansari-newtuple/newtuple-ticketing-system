import { SmError, smFetch } from "@/lib/sm/client";

const CACHE_MS = 5 * 60_000;

interface PublishedWorkflow {
  entity_type: string;
  machine_name: string;
}

let cache: { at: number; byType: Map<string, string[]> } | null = null;

/** Every published workflow, grouped by the entity type it runs. Kept for a few minutes. */
async function publishedByType(force = false): Promise<Map<string, string[]>> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.byType;
  const all = await smFetch<{ published_items?: PublishedWorkflow[] }>("GET", "/workflow-state-machines");
  const byType = new Map<string, string[]>();
  for (const w of all.published_items ?? []) {
    const names = byType.get(w.entity_type) ?? [];
    if (!names.includes(w.machine_name)) names.push(w.machine_name);
    byType.set(w.entity_type, names);
  }
  cache = { at: Date.now(), byType };
  return byType;
}

/** Forgets what was learned, so the next call asks the State Machine again. */
export function forgetMachines() {
  cache = null;
}

/**
 * The workflow that runs an entity type in the State Machine this app is connected to.
 *
 * Workflow names are different in every State Machine, so a name saved in a setting can be wrong without anything saying so:
 * listing a workflow that does not exist just returns nothing. This asks the State Machine instead.
 * `preferred` (the saved setting) is used only while it really is a published workflow of that entity type.
 * When an entity type has more than one published workflow, `preferred` decides; without it the first one is used and a warning is logged.
 */
export async function machineFor(entityType: string, preferred?: string): Promise<string> {
  let known: string[] | undefined;
  try {
    known = (await publishedByType()).get(entityType);
  } catch (e) {
    // The list could not be read. Fall back to the saved name rather than failing a call that might still work.
    if (preferred) return preferred;
    throw e;
  }
  if (preferred && known?.includes(preferred)) return preferred;
  if (!known?.length) {
    // It may have been published after the list was read; look once more before giving up.
    known = (await publishedByType(true)).get(entityType);
  }
  if (!known?.length) throw new SmError(404, `No published workflow runs "${entityType}" in this State Machine`);
  if (preferred && !known.includes(preferred)) console.warn(`workflow ${preferred} is not published for "${entityType}"; using ${known[0]} instead`);
  if (known.length > 1) console.warn(`"${entityType}" has ${known.length} published workflows (${known.join(", ")}); using ${known[0]}`);
  return known[0];
}
