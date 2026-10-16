// Builds DC QC in the State Machine the way CitiTrends defines it: the Shipment, UPC and Pallet entities, their forms (FR forms) and the
// "DCQC Shipment QC" and "DCQC UPC QC" workflows, taken from data/dcqc. Safe to run again.
//   node scripts/sm-dcqc.mjs
import { appendFileSync, readFileSync } from "node:fs";

process.loadEnvFile(".env");

const BASE = process.env.SM_BASE_URL;
const APP_URL = process.env.SM_CONNECTOR_BASE_URL ?? "http://host.docker.internal:3001";
const KEY = process.env.SM_CONNECTOR_KEY;
if (!BASE || !KEY || !process.env.SM_EMAIL || !process.env.SM_PASSWORD) throw new Error("SM_BASE_URL, SM_EMAIL, SM_PASSWORD and SM_CONNECTOR_KEY must be set in .env");

const call = async (method, path, body, token) => {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 800)}`);
  return json;
};
const rows = (x) => (Array.isArray(x) ? x : x?.items ?? []);
const load = (name) => JSON.parse(readFileSync(`data/dcqc/${name}`, "utf8"));
const { access_token: token } = await call("POST", "/auth/login", { email: process.env.SM_EMAIL, password: process.env.SM_PASSWORD });

// QC photos use a dedicated file type. Provision it with the QC workflows so uploads work on a fresh State Machine too.
const fileTypes = rows(await call("GET", "/config/file-types", undefined, token));
if (fileTypes.some((fileType) => fileType.type_id === "qc_photo")) console.log("file type exists    qc_photo");
else {
  await call("POST", "/config/file-types", { type_id: "qc_photo", display_name: "QC photo", description: "Goods and label photos captured during DC quality checks", folder: "dc-qc-photos", allowed_extensions: [".jpg", ".jpeg", ".png"], max_size_mb: 10 }, token);
  console.log("file type created   qc_photo");
}

const FORMS = load("forms.json");
const WORKFLOWS = [
  { key: "shipment", file: "shipment-workflow.json", forms: ["Shipment Details", "QC Completion", "Receipt Action"] },
  { key: "upc", file: "upc-workflow.json", forms: ["Product Details", "QC Summary", "Exception Summary", "QC Action"] },
];

// ------------------------------------------------------------------ entity types
const types = rows(await call("GET", "/entity-types", undefined, token));
for (const [name, description] of [["shipment", "A purchase order shipment being quality checked at the DC"], ["upc", "One UPC on a shipment"], ["pallet", "A pallet of a UPC"], ["dcqc_flag", "An exception flagged on a UPC"], ["dcqc_notification", "A message sent to a supervisor or associate"]]) {
  if (types.some((t) => t.name === name)) console.log(`entity type exists   ${name}`);
  else {
    await call("POST", "/entity-types", { name, description }, token);
    console.log(`entity type created  ${name}`);
  }
}

// ------------------------------------------------------------------ people: the user fields are dropdowns of the real State Machine users
// The value stored is the user's id and the label shown is their name and role. Run this script again after adding users.
const USER_FIELDS = ["user_id", "supervisor_user_id", "resolved_by_user_id", "assigned_to_user_id"];
const users = rows(await call("GET", "/users?limit=200", undefined, token)).filter((u) => u.is_active !== false && (u.status ?? "active") === "active" && u.email !== process.env.SM_EMAIL && u.role !== "superadmin");
const USER_OPTIONS = { enum_values: users.map((u) => u.id), enum_labels: users.map((u) => `${u.full_name || u.email} (${u.role ?? "user"})`) };
console.log(`user dropdown: ${users.length} users`);

// ------------------------------------------------------------------ library fields, then the forms
const LIBRARY_TYPE = { text: "text", integer: "integer", boolean: "boolean", select: "select" };
const existing = rows(await call("GET", "/field-library/fields?limit=200", undefined, token));
const byKey = new Map(existing.map((f) => [f.field_key ?? f.identity?.field_key, f]));
const library = {};
for (const form of FORMS) {
  for (const f of form.fields) {
    if (library[f.key]) continue;
    const isUser = USER_FIELDS.includes(f.key);
    const type = isUser ? "select" : LIBRARY_TYPE[f.type];
    if (!type) throw new Error(`Unsupported field type "${f.type}" on ${f.key}`);
    const settings = isUser ? USER_OPTIONS : f.enum.length ? { enum_labels: f.enum, enum_values: f.enum } : {};
    let field = byKey.get(f.key);
    const current = field?.field_type ?? field?.identity?.field_type;
    if (field && isUser) {
      const same = current === "select" && JSON.stringify(field.version?.settings?.enum_values ?? []) === JSON.stringify(settings.enum_values);
      if (!same) {
        const id = field.library_field_id ?? field.identity?.library_field_id ?? field.id;
        await call("POST", `/field-library/fields/${id}/versions`, { field_type: "select", description: `DC QC: ${f.key}`, settings }, token);
        console.log(`field updated        ${f.key}: ${current} -> select (${users.length} users)`);
      }
    } else if (field && current !== type) throw new Error(`Library field "${f.key}" already exists as ${current}, but DC QC needs ${type}`);
    if (!field) {
      field = await call("POST", "/field-library/fields", { name: f.key, field_key: f.key, field_type: type, description: `DC QC: ${f.key}`, settings }, token);
      console.log(`field created        ${f.key}`);
    }
    library[f.key] = { id: field.library_field_id ?? field.identity?.library_field_id ?? field.id, type };
  }
}

const methods = rows(await call("GET", "/method-library/methods?limit=200", undefined, token));
const formIds = {};
for (const form of FORMS) {
  const fields = form.fields.map((f, i) => ({ library_field_id: library[f.key].id, label: f.key, required: f.required, position: i + 1, follows_latest: true }));
  const found = methods.find((m) => m.name === form.name);
  if (found) {
    await call("PUT", `/method-library/methods/${found.method_id}/fields`, { fields }, token);
    console.log(`form updated         ${form.name}`);
  } else {
    await call("POST", "/method-library/methods", { name: form.name, description: `${form.code} ${form.name}`, entity_types: [form.entity], fields }, token);
    console.log(`form created         ${form.name}`);
  }
}
for (const m of rows(await call("GET", "/method-library/methods?limit=200", undefined, token))) if (FORMS.some((f) => f.name === m.name)) formIds[m.name] = m.method_id;
for (const f of FORMS) if (!formIds[f.name]) throw new Error(`Form "${f.name}" was not found after creating it`);

// ------------------------------------------------------------------ connectors (what the app adds on top of the CitiTrends workflows)
// A shipment keeps its own id in record_id; a UPC keeps it in dcqc_record_id.
const BY_ID = { record_id: "$entity.record_id" };
const BY_UPC_ID = { record_id: "$entity.dcqc_record_id" };
const CONNECTORS = [
  { name: "DCQC: fetch shipments", entity: "shipment", path: "/api/sm/dcqc/fetch-shipments", body: {}, tool: true },
  { name: "DCQC: roll up shipment", entity: "upc", path: "/api/sm/dcqc/rollup", body: BY_UPC_ID },
  { name: "DCQC: count matcher", entity: "upc", path: "/api/sm/dcqc/count-match", body: BY_UPC_ID },
  { name: "DCQC: notify supervisor", entity: "upc", path: "/api/sm/dcqc/notify", body: { ...BY_UPC_ID, event: "UPC_FLAGGED" } },
  { name: "DCQC: notify QC started", entity: "shipment", path: "/api/sm/dcqc/notify", body: { ...BY_ID, event: "QC_STARTED" } },
  { name: "DCQC: notify QC complete", entity: "shipment", path: "/api/sm/dcqc/notify", body: { ...BY_ID, event: "QC_COMPLETE" } },
  { name: "DCQC: notify receipt closed", entity: "shipment", path: "/api/sm/dcqc/notify", body: { ...BY_ID, event: "RECEIPT_CLOSED" } },
];
const connectorList = rows(await call("GET", "/connectors", undefined, token));
const connectorIds = {};
for (const c of CONNECTORS) {
  const payload = {
    name: c.name,
    entity_types: [c.entity],
    base_url: APP_URL,
    method: "POST",
    path: c.path,
    content_type: "application/json",
    body_template: c.body,
    auth_type: "api_key",
    auth_config: { in: "header", name: "X-API-Key" },
    secrets: { api_key: KEY },
    response_mapping: {},
    expose_as_tool: Boolean(c.tool),
    success_when: { status_in: [200], json_path: "ok", equals: "True" },
  };
  const found = connectorList.find((x) => x.name === c.name);
  const saved = found ? await call("PATCH", `/connectors/${found.id ?? found.connector_id}`, payload, token) : await call("POST", "/connectors", payload, token);
  connectorIds[c.name] = saved.id ?? saved.connector_id ?? found?.id;
  console.log(`connector ${found ? "updated" : "created"}  ${c.name}`);
}
const action = (connector) => ({ kind: "webhook.http", config: { connector_id: connectorIds[connector], writeback_target: "entity" }, outcome_triggers: {}, failure_policy: { on_failure: "stop" } });
const ACTIONS = {
  shipment: { IN_PROGRESS: [action("DCQC: notify QC started")], QC_COMPLETE: [action("DCQC: notify QC complete")], CLOSED: [action("DCQC: notify receipt closed")] },
  upc: { IN_PROGRESS: [action("DCQC: count matcher"), action("DCQC: roll up shipment")], SUPERVISOR_HOLD: [action("DCQC: roll up shipment"), action("DCQC: notify supervisor")], APPROVED: [action("DCQC: roll up shipment")], WONT_QC: [action("DCQC: roll up shipment")] },
};

// ------------------------------------------------------------------ workflows
// Differences from the CitiTrends definitions: the forms are attached to every state so they show in the State Machine, the price fields are
// text (matching their form field type) instead of float, and the UPC workflow has one extra step, "count_check", that re-runs the count matcher
// connector each time a pallet is saved.
const machines = {};
for (const wf of WORKFLOWS) {
  const source = load(wf.file).definition;
  const definition = structuredClone(source);
  definition.machine_key = `dcqc_${wf.key}_qc`;
  for (const f of definition.entity_schema.fields) if (f.type === "float") f.type = "string";
  for (const f of definition.entity_schema.fields) {
    if (!USER_FIELDS.includes(f.field)) continue;
    Object.assign(f, { type: "enum", enum_values: USER_OPTIONS.enum_values, enum_labels: USER_OPTIONS.enum_labels });
  }
  for (const t of definition.transitions) for (const r of t.required_fields ?? []) if (USER_FIELDS.includes(r.field)) r.type = "enum";
  if (wf.key === "upc" && !definition.transitions.some((t) => t.trigger === "count_check")) {
    definition.transitions.push({ key: "count_check", trigger: "count_check", label: "Count check", from: "IN_PROGRESS", to_state: "IN_PROGRESS", required_fields: [], guards: [], pre_transition_tasks: [], post_transition_tasks: [], auto_transition: null, description: "Re-checks the pallet counts against the PO." });
  }
  for (const state of definition.states) {
    delete state.id;
    state.on_state_actions = ACTIONS[wf.key][state.name] ?? [];
    state.method_refs = wf.forms.map((name) => ({ method_id: formIds[name], version_id: null }));
  }

  const all = await call("GET", "/workflow-state-machines", undefined, token);
  const published = (all.published_items ?? []).find((w) => w.name === definition.name && w.entity_type === definition.entity_type);
  let rowId;
  if (published) {
    definition.machine_key = published.definition?.machine_key ?? definition.machine_key;
    rowId = (await call("POST", `/workflow-state-machines/${published.machine_name}/draft`, {}, token)).id;
  } else {
    const stale = (all.draft_items ?? []).find((w) => w.entity_type === definition.entity_type);
    rowId = stale?.id ?? (await call("POST", "/workflow-state-machines/draft", { name: definition.name, description: definition.description }, token)).id;
  }
  await call("PUT", `/workflow-state-machines/${rowId}/draft`, { definition }, token);
  const verdict = await call("POST", "/workflow-state-machines/validate", definition, token).catch((e) => ({ error: e.message }));
  const issues = verdict.validation_report?.issues ?? verdict;
  console.log(`validation ${definition.name}:`, JSON.stringify(issues).slice(0, 1200));
  if (verdict.can_publish === false || verdict.error) throw new Error(`${definition.name} cannot be published yet`);
  const done = await call("POST", `/workflow-state-machines/${rowId}/publish`, { definition }, token);
  machines[wf.key] = done.state_machine?.machine_name ?? published?.machine_name;
  console.log(`workflow published   ${definition.name} -> ${machines[wf.key]} (version ${done.state_machine?.version})`);
}

const env = readFileSync(".env", "utf8");
const exported = { SM_DCQC_SHIPMENT_MACHINE_NAME: machines.shipment, SM_DCQC_UPC_MACHINE_NAME: machines.upc };
const missing = Object.entries(exported).filter(([k]) => !new RegExp(`^${k}=`, "m").test(env));
if (missing.length) appendFileSync(".env", `\n# DC QC workflows, written by scripts/sm-dcqc.mjs\n${missing.map(([k, v]) => `${k}=${v}`).join("\n")}\n`);
console.log(JSON.stringify(exported));
