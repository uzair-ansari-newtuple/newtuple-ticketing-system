// Attaches the ticketing connectors to the ResolverIQ workflow states.
//   node scripts/sm-workflow.mjs --mode step            save and validate a draft where each state waits for a click
//   node scripts/sm-workflow.mjs --mode auto --publish  publish a version where tickets move on by themselves
import { readFileSync } from "node:fs";

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
  NEW: notifyAction("Ticketing: sync resolver action"),
  INPROGRESS: notifyAction("Ticketing: sync resolver action"),
  RESOLVED: notifyAction("Ticketing: sync resolver action"),
  NOT_CT_MERCH: notifyAction("Ticketing: sync resolver action"),
  CANT_RESOLVE: notifyAction("Ticketing: sync resolver action"),
  NEEDS_L2: notifyAction("Ticketing: notify L2 resolvers"),
};

// The form each state shows, so a person looking at a ticket in the State Machine sees what that stage produced.
const methodList = await call("GET", "/method-library/methods?limit=200", undefined, token);
const methodId = (name) => (Array.isArray(methodList) ? methodList : methodList.items).find((m) => m.name === name)?.method_id ?? (() => { throw new Error(`Form "${name}" not found. Run scripts/sm-forms.mjs first.`); })();
const FORMS = {
  CAPTURED: ["Incident: capture"],
  IMAGE_MAPPED: ["Incident: item details"],
  AI_IDENTIFICATION: ["Incident: matches"],
  NEW: ["Incident: matches", "Incident: store follow-up"],
  INPROGRESS: ["Incident: matches", "Incident: resolver"],
  RESOLVED: ["Incident: store follow-up", "Incident: resolver"],
  NOT_CT_MERCH: ["Incident: resolver", "Incident: store follow-up"],
  CANT_RESOLVE: ["Incident: resolver", "Incident: store follow-up"],
  NEEDS_L2: ["Incident: resolver"],
};

const active = await call("GET", `/workflow-state-machines/${MACHINE}/active`, undefined, token);
const definition = structuredClone(active.definition);
for (const state of definition.states) {
  if (ACTIONS[state.name]) state.on_state_actions = [structuredClone(ACTIONS[state.name])];
  if (FORMS[state.name]) state.method_refs = FORMS[state.name].map((name) => ({ method_id: methodId(name), version_id: null }));
}

// The State Machine hands out the ticket number from its own atomic counter.
const numberField = definition.entity_schema.fields.find((f) => f.field === "incident_number");
if (numberField) {
  numberField.type = "auto_number";
  numberField.auto_number_config = { affix_mode: "prefix", affix: "TK" };
  numberField.default = null;
}

// The forms show these as dropdowns, so the workflow must store them as the same kind of field.
const catalog = JSON.parse(readFileSync("data/products.json", "utf8")).map((p) => [`${p.name} · ${p.sku}`, p.sku]);
const DROPDOWNS = {
  selected_candidate: catalog,
  resolver_reason_codes: [["NO_MATCH_FOUND", "no_match_found"], ["MANUAL_REVIEW", "manual_revie"], ["NOT_CITITRENDS_MERCHANDISE", "not_cititrends_merchandise"]],
  resolver_decision: [["Resolved", "resolved"], ["Unable", "unable"], ["Duplicate-Merged", "duplicate-merged"]],
};
for (const [field, options] of Object.entries(DROPDOWNS)) {
  const f = definition.entity_schema.fields.find((x) => x.field === field);
  if (f) Object.assign(f, { type: "enum", enum_labels: options.map((o) => o[0]), enum_values: options.map((o) => o[1]) });
  for (const t of definition.transitions) for (const r of t.required_fields ?? []) if (r.field === field) r.type = "enum";
}

// Long-text fields in the forms are the workflow's "text" type, not "string".
const LONG_TEXT = ["escalation_note", "resolver_comment", "photos", "photo_urls", "store_capture", "ocr_text", "extracted_metadata", "edw_candidates", "event_log"];
for (const field of LONG_TEXT) {
  const f = definition.entity_schema.fields.find((x) => x.field === field);
  if (f) f.type = "text";
  for (const t of definition.transitions) for (const r of t.required_fields ?? []) if (r.field === field) r.type = "text";
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

// The demo cockpit sends a ticket back to the first state from any other state.
for (const state of definition.states) {
  if (state.name === "CAPTURED" || state.tags?.includes("terminal") || definition.transitions.some((t) => t.trigger === "demo_reset" && t.from === state.name)) continue;
  definition.transitions.push({ key: `${state.name.toLowerCase()}__demo_reset`, trigger: "demo_reset", label: "Reset to start", from: state.name, to_state: "CAPTURED", required_fields: [], guards: [], pre_transition_tasks: [], post_transition_tasks: [], auto_transition: null, description: "Demo cockpit: start this ticket again." });
}

const draft = await call("POST", `/workflow-state-machines/${MACHINE}/draft`, {}, token);
const rowId = draft.id ?? draft.row_id;
await call("PUT", `/workflow-state-machines/${rowId}/draft`, { definition }, token);
console.log(`Draft saved (${mode} mode) on row ${rowId}`);

const verdict = await call("POST", "/workflow-state-machines/validate", definition, token).catch((e) => ({ error: e.message }));
console.log("Validation:", JSON.stringify(verdict.validation_report?.issues ?? verdict).slice(0, 1500), "| can publish:", verdict.can_publish);

if (publish) {
  const published = await call("POST", `/workflow-state-machines/${rowId}/publish`, { definition }, token);
  console.log("Published:", JSON.stringify(published).slice(0, 400));
}
