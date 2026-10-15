// Attaches the ticketing connectors to the ResolverIQ workflow states.
//   node scripts/sm-workflow.mjs --mode step            save and validate a draft where each state waits for a click
//   node scripts/sm-workflow.mjs --mode auto --publish  publish a version where tickets move on by themselves
process.loadEnvFile(".env");

const args = process.argv.slice(2);
const mode = args.includes("--mode") ? args[args.indexOf("--mode") + 1] : "step";
const publish = args.includes("--publish");
if (!["step", "auto"].includes(mode)) throw new Error("--mode must be step or auto");

const BASE = process.env.SM_BASE_URL;
const MACHINE = process.env.SM_MACHINE_NAME ?? "workflow_dguyp0t8_9f7jus";

const call = async (method, path, body, token) => {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 600)}`);
  return json;
};

const { access_token: token } = await call("POST", "/auth/login", { email: process.env.SM_EMAIL, password: process.env.SM_PASSWORD });
const listed = await call("GET", "/connectors", undefined, token);
const connectors = Object.fromEntries((Array.isArray(listed) ? listed : listed.items ?? []).map((c) => [c.name, c.id ?? c.connector_id]));
const need = (name) => connectors[name] ?? (() => { throw new Error(`Connector "${name}" is not registered. Run scripts/sm-setup.mjs first.`); })();

/** A connector call on state entry. In auto mode its outcome fires the next transition, in step mode the ticket waits. */
const pipelineAction = (connector, next) => ({
  kind: "webhook.http",
  config: { connector_id: need(connector), writeback_target: "entity" },
  outcome_triggers: mode === "auto" ? { success: next, failed: next } : {},
  failure_policy: mode === "auto" ? { on_failure: "fire_trigger", trigger: next } : { on_failure: "stop" },
});
const notifyAction = (connector) => ({ kind: "webhook.http", config: { connector_id: need(connector), writeback_target: "entity" }, outcome_triggers: {}, failure_policy: { on_failure: "stop" } });

const ACTIONS = {
  CAPTURED: pipelineAction("Ticketing: analyze photos", "to_image_mapped"),
  IMAGE_MAPPED: pipelineAction("Ticketing: map attributes", "to_ai_identification"),
  AI_IDENTIFICATION: pipelineAction("Ticketing: identify candidates", "ai_identification_to_new"),
  RESOLVED: notifyAction("Ticketing: notify store"),
  NOT_CT_MERCH: notifyAction("Ticketing: notify store"),
  CANT_RESOLVE: notifyAction("Ticketing: notify store"),
  NEEDS_L2: notifyAction("Ticketing: notify L2 resolvers"),
};

const active = await call("GET", `/workflow-state-machines/${MACHINE}/active`, undefined, token);
const definition = structuredClone(active.definition);
for (const state of definition.states) {
  if (ACTIONS[state.name]) state.on_state_actions = [structuredClone(ACTIONS[state.name])];
}

// The State Machine hands out the ticket number from its own atomic counter.
const numberField = definition.entity_schema.fields.find((f) => f.field === "incident_number");
if (numberField) {
  numberField.type = "auto_number";
  numberField.auto_number_config = { affix_mode: "prefix", affix: "TK" };
  numberField.default = null;
}

// A store that resolves its own ticket, with no resolver involved, ends the ticket too.
if (!definition.transitions.some((t) => t.trigger === "store_to_resolved")) {
  definition.transitions.push({
    key: "new__to__resolved",
    trigger: "store_to_resolved",
    label: "Resolved by store",
    from: "NEW",
    to_state: "RESOLVED",
    required_fields: [{ field: "selected_candidate", required: true, type: "string" }],
    guards: [],
    pre_transition_tasks: [],
    post_transition_tasks: [],
    auto_transition: null,
    description: "The store picked the right item itself.",
  });
}

const draft = await call("POST", `/workflow-state-machines/${MACHINE}/draft`, {}, token);
const rowId = draft.id ?? draft.row_id;
await call("PUT", `/workflow-state-machines/${rowId}/draft`, { definition }, token);
console.log(`Draft saved (${mode} mode) on row ${rowId}`);

const verdict = await call("POST", "/workflow-state-machines/validate", definition, token).catch((e) => ({ error: e.message }));
console.log("Validation:", JSON.stringify(verdict).slice(0, 500));

if (publish) {
  const published = await call("POST", `/workflow-state-machines/${rowId}/publish`, { definition }, token);
  console.log("Published:", JSON.stringify(published).slice(0, 400));
}
