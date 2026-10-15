// Builds the DC QC flow in the State Machine: entity types, photo file type, forms, connectors and three workflows
// (purchase order, UPC line, pallet). Safe to run again.
//   node scripts/sm-qc.mjs
import { appendFileSync, readFileSync } from "node:fs";

process.loadEnvFile(".env");

const BASE = process.env.SM_BASE_URL;
const APP_URL = process.env.SM_CONNECTOR_BASE_URL ?? "http://host.docker.internal:3001";
const KEY = process.env.SM_CONNECTOR_KEY;
if (!BASE || !KEY || !process.env.SM_EMAIL || !process.env.SM_PASSWORD) throw new Error("SM_BASE_URL, SM_EMAIL, SM_PASSWORD and SM_CONNECTOR_KEY must be set in .env");

const call = async (method, path, body, token) => {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 700)}`);
  return json;
};
const rows = (x) => (Array.isArray(x) ? x : x?.items ?? []);
const select = (pairs) => ({ enum_labels: pairs.map((p) => p[0]), enum_values: pairs.map((p) => p[1]) });
const { access_token: token } = await call("POST", "/auth/login", { email: process.env.SM_EMAIL, password: process.env.SM_PASSWORD });

// ------------------------------------------------------------------ what the flow stores
const EXCEPTION_REASONS = select([["Short shipment", "short_shipment"], ["Over shipment", "over_shipment"], ["Damaged goods", "damaged"], ["Wrong item received", "wrong_item"], ["Missing or unreadable label", "missing_label"], ["Something else", "other"]]);
const COUNT_RESULT = select([["Match", "match"], ["Short", "short"], ["Over", "over"]]);

// [label, key, library type, description, settings]
const FIELDS = [
  ["Record ID", "record_id", "text", "Id of this record, kept on it so connectors can find it."],
  // purchase order
  ["PO Number", "po_number", "text", "Purchase order number."],
  ["Supplier", "supplier", "text", "Supplier that shipped the goods."],
  ["Expected Date", "expected_date", "text", "Date the PO was due at the DC."],
  ["Shipment Number", "shipment_number", "text", "Shipment the PO arrived on."],
  ["Carrier", "carrier", "text", "Carrier that delivered the shipment."],
  ["Trailer", "trailer", "text", "Trailer the goods arrived in."],
  ["Arrived At", "arrived_at", "datetime", "When the shipment arrived at the DC."],
  ["Pallet Count", "pallet_count", "integer", "Pallets on the PO."],
  ["UPC Count", "line_count", "integer", "UPC lines on the PO."],
  ["Units Expected", "unit_count", "integer", "Units the PO asked for."],
  ["Units Received", "received_units", "integer", "Units counted so far."],
  ["UPCs To Check", "pending_count", "integer", "UPC lines still to be checked."],
  ["UPCs Verified", "verified_count", "integer", "UPC lines that matched the PO."],
  ["Exceptions Raised", "exception_count", "integer", "UPC lines with an exception."],
  ["Open Exceptions", "open_exception_count", "integer", "Exceptions not yet resolved."],
  ["QC Started At", "started_at", "datetime", "When QC started."],
  ["QC Completed At", "completed_at", "datetime", "When QC was completed."],
  ["QC Summary Note", "qc_summary_note", "textarea", "Note added when QC was completed."],
  ["QC Activity", "qc_event_log", "textarea", "History of what happened on the PO."],
  // UPC line
  ["Line PO ID", "line_po_id", "text", "Purchase order record the UPC line belongs to."],
  ["Line PO Number", "line_po_number", "text", "Purchase order number the UPC line belongs to."],
  ["UPC / GTIN", "upc", "text", "Barcode of the product."],
  ["SKU", "sku", "text", "SKU of the product."],
  ["Product Name", "product_name", "text", "Name of the product."],
  ["Pallet Number", "pallet_number", "text", "Pallet the UPC is on."],
  ["Expected Quantity", "expected_qty", "integer", "Units the PO asked for."],
  ["Received Quantity", "received_qty", "integer", "Units counted at the DC."],
  ["Photos Taken", "photo_count", "integer", "Photos of the goods saved on the UPC line."],
  ["Count Result", "count_result", "select", "How the count compares with the PO.", COUNT_RESULT],
  ["Count Difference", "count_diff", "integer", "Units short or over."],
  ["Exception Reason", "exception_reason", "select", "Why the goods did not match.", EXCEPTION_REASONS],
  ["Exception Note", "exception_note", "textarea", "Note for the supervisor."],
  ["Exception Raised At", "exception_raised_at", "datetime", "When the exception was raised."],
  ["Resolution Note", "resolution_note", "textarea", "What was done about the exception."],
  ["Resolved At", "resolved_at", "datetime", "When the exception was resolved."],
  // pallet
  ["Pallet Position", "pallet_position", "text", "Where the pallet is in the DC."],
  ["Pallet PO ID", "pallet_po_id", "text", "Purchase order record the pallet belongs to."],
  ["Pallet PO Number", "pallet_po_number", "text", "Purchase order number the pallet belongs to."],
  ["Pallet UPCs", "pallet_line_count", "integer", "UPC lines on the pallet."],
  ["Pallet UPCs Open", "pallet_open_count", "integer", "UPC lines on the pallet still to be settled."],
  ["Identifier", "identifier", "text", "Name shown for the record."],
];
const TYPE = { text: "string", textarea: "text", integer: "int", datetime: "datetime", select: "enum", boolean: "boolean" };

const PO_KEYS = ["identifier", "record_id", "po_number", "supplier", "expected_date", "shipment_number", "carrier", "trailer", "arrived_at", "pallet_count", "line_count", "unit_count", "received_units", "pending_count", "verified_count", "exception_count", "open_exception_count", "started_at", "completed_at", "qc_summary_note", "qc_event_log"];
const LINE_KEYS = ["identifier", "record_id", "line_po_id", "line_po_number", "upc", "sku", "product_name", "pallet_number", "expected_qty", "received_qty", "photo_count", "count_result", "count_diff", "exception_reason", "exception_note", "exception_raised_at", "resolution_note", "resolved_at"];
const PALLET_KEYS = ["identifier", "record_id", "pallet_position", "pallet_po_id", "pallet_po_number", "pallet_line_count", "pallet_open_count"];

const FORMS = [
  { name: "DC QC: purchase order", entity: "dc_po", keys: ["po_number", "supplier", "expected_date", "shipment_number", "carrier", "trailer", "arrived_at", "pallet_count", "line_count", "unit_count"] },
  { name: "DC QC: progress", entity: "dc_po", keys: ["received_units", "pending_count", "verified_count", "exception_count", "open_exception_count", "started_at", "completed_at", "qc_summary_note", "qc_event_log"] },
  { name: "DC QC line: item", entity: "dc_upc_line", keys: ["line_po_number", "upc", "sku", "product_name", "pallet_number", "expected_qty"] },
  { name: "DC QC line: count", entity: "dc_upc_line", keys: ["received_qty", "photo_count", "count_result", "count_diff"] },
  { name: "DC QC line: exception", entity: "dc_upc_line", keys: ["exception_reason", "exception_note", "exception_raised_at"] },
  { name: "DC QC line: resolution", entity: "dc_upc_line", keys: ["resolution_note", "resolved_at"] },
  { name: "DC QC pallet", entity: "dc_pallet", keys: ["pallet_position", "pallet_po_number", "pallet_line_count", "pallet_open_count"] },
];

// ------------------------------------------------------------------ entity types and the photo file type
const types = rows(await call("GET", "/entity-types", undefined, token));
for (const [name, description] of [["dc_po", "A purchase order being quality checked at the DC"], ["dc_upc_line", "One UPC on a purchase order"], ["dc_pallet", "A pallet that arrived with a purchase order"]]) {
  if (types.some((t) => t.name === name)) console.log(`entity type exists   ${name}`);
  else {
    await call("POST", "/entity-types", { name, description }, token);
    console.log(`entity type created  ${name}`);
  }
}
const fileTypes = rows(await call("GET", "/config/file-types", undefined, token));
if (fileTypes.some((t) => t.type_id === "qc_photo")) console.log("file type exists     qc_photo");
else {
  await call("POST", "/config/file-types", { type_id: "qc_photo", display_name: "QC photo", description: "Photo of the goods received for a UPC", folder: "qc-photos", allowed_extensions: [".jpg", ".jpeg", ".png"], max_size_mb: 10 }, token);
  console.log("file type created    qc_photo");
}

// ------------------------------------------------------------------ library fields and forms
const existing = rows(await call("GET", "/field-library/fields?limit=200", undefined, token));
const byKey = new Map(existing.map((f) => [f.field_key ?? f.identity?.field_key, f]));
const library = {};
for (const [name, field_key, field_type, description, settings = {}] of FIELDS) {
  let field = byKey.get(field_key);
  if (!field) {
    field = await call("POST", "/field-library/fields", { name, field_key, field_type, description, settings }, token);
    console.log(`field created        ${field_key}`);
  }
  library[field_key] = { id: field.library_field_id ?? field.identity?.library_field_id ?? field.id, label: name, type: field_type, settings, current: field.field_type ?? field.identity?.field_type };
}
for (const [key, f] of Object.entries(library)) {
  if (f.current && f.current !== f.type) throw new Error(`Library field "${key}" already exists as ${f.current}, but the QC flow needs ${f.type}`);
}

const methods = rows(await call("GET", "/method-library/methods?limit=200", undefined, token));
const formIds = {};
for (const form of FORMS) {
  const fields = form.keys.map((key, i) => ({ library_field_id: library[key].id, label: library[key].label, required: false, position: i + 1, follows_latest: true }));
  const found = methods.find((m) => m.name === form.name);
  if (found) {
    await call("PUT", `/method-library/methods/${found.method_id}/fields`, { fields }, token);
    formIds[form.name] = found.method_id;
    console.log(`form updated         ${form.name}`);
  } else {
    const made = await call("POST", "/method-library/methods", { name: form.name, description: form.name, entity_types: [form.entity], fields }, token);
    formIds[form.name] = made.method_id;
    console.log(`form created         ${form.name}`);
  }
}

for (const m of rows(await call("GET", "/method-library/methods?limit=200", undefined, token))) if (FORMS.some((f) => f.name === m.name)) formIds[m.name] = m.method_id;
for (const f of FORMS) if (!formIds[f.name]) throw new Error(`Form "${f.name}" was not found after creating it`);

// ------------------------------------------------------------------ connectors
// The endpoints save their own results, so no response mapping (the State Machine would write back a stale copy).
const BY_ID = { record_id: "$entity.record_id" };
const CONNECTORS = [
  { name: "QC: fetch purchase orders", entity: "dc_po", path: "/api/sm/qc/fetch-pos", body: {}, tool: true },
  { name: "QC: count matcher", entity: "dc_upc_line", path: "/api/sm/qc/count-match", body: BY_ID },
  { name: "QC: roll up PO", entity: "dc_upc_line", path: "/api/sm/qc/rollup", body: BY_ID },
  { name: "QC: notify QC started", entity: "dc_po", path: "/api/sm/qc/notify", body: { ...BY_ID, event: "QC_STARTED" } },
  { name: "QC: notify exceptions open", entity: "dc_po", path: "/api/sm/qc/notify", body: { ...BY_ID, event: "EXCEPTIONS_OPEN" } },
  { name: "QC: notify QC complete", entity: "dc_po", path: "/api/sm/qc/notify", body: { ...BY_ID, event: "QC_COMPLETE" } },
  { name: "QC: pallet checked", entity: "dc_pallet", path: "/api/sm/qc/notify", body: { ...BY_ID, event: "PALLET_CHECKED" } },
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

// ------------------------------------------------------------------ workflows
const field = (key) => {
  const f = library[key];
  return { field: key, type: TYPE[f.type], required: false, nullable: true, default: null, enum_values: f.settings.enum_values ?? [], enum_labels: f.settings.enum_labels ?? [], picklist_id: null, picklist_id_2: null, enum_values_2: [], enum_labels_2: [], source_states: [] };
};
const action = (connector, extra = {}) => ({ kind: "webhook.http", config: { connector_id: connectorIds[connector], writeback_target: "entity" }, outcome_triggers: {}, failure_policy: { on_failure: "stop" }, ...extra });
const state = (name, order, { tags = [], forms = [], actions = [] } = {}) => ({
  name,
  tags,
  order,
  on_state_actions: actions,
  method_refs: forms.map((f) => ({ method_id: formIds[f], version_id: null })),
});
const transition = (trigger, label, from, to_state, { required = [], guards = [], description = null } = {}) => ({
  key: `${from.toLowerCase()}__${trigger}`,
  trigger,
  label,
  from,
  to_state,
  required_fields: required.map((key) => ({ field: key, required: true, type: TYPE[library[key].type] })),
  guards,
  pre_transition_tasks: [],
  post_transition_tasks: [],
  auto_transition: null,
  description,
});
const lte = (field, value = 0) => ({ type: "numerical_value_lte", field, value });
const gte = (field, value) => ({ type: "numerical_value_gte", field, value });

const PO_FORMS = ["DC QC: purchase order", "DC QC: progress"];
const LINE_ITEM = "DC QC line: item";

const WORKFLOWS = [
  {
    key: "po",
    entity: "dc_po",
    name: "DC QC - Purchase Order",
    description: "A purchase order from fetch to QC complete",
    keys: PO_KEYS,
    initial: "FETCHED",
    states: [
      state("FETCHED", 1, { tags: ["initial"], forms: PO_FORMS }),
      state("QC_IN_PROGRESS", 2, { forms: PO_FORMS, actions: [action("QC: notify QC started")] }),
      state("EXCEPTIONS_OPEN", 3, { forms: PO_FORMS, actions: [action("QC: notify exceptions open")] }),
      state("QC_COMPLETE", 4, { tags: ["terminal"], forms: PO_FORMS, actions: [action("QC: notify QC complete")] }),
    ],
    transitions: [
      transition("start_qc", "Start QC", "FETCHED", "QC_IN_PROGRESS"),
      transition("complete_qc", "Complete QC", "QC_IN_PROGRESS", "QC_COMPLETE", { guards: [lte("pending_count"), lte("open_exception_count")], description: "Every UPC is checked and nothing is open." }),
      transition("complete_with_exceptions", "Complete with exceptions", "QC_IN_PROGRESS", "EXCEPTIONS_OPEN", { guards: [lte("pending_count"), gte("open_exception_count", 1)], description: "Every UPC is checked, but some exceptions are still open." }),
      transition("resolve_exceptions", "Exceptions resolved", "EXCEPTIONS_OPEN", "QC_COMPLETE", { guards: [lte("open_exception_count")] }),
    ],
  },
  {
    key: "line",
    entity: "dc_upc_line",
    name: "DC QC - UPC Line",
    description: "One UPC: count, photo, match against the PO, exception",
    keys: LINE_KEYS,
    initial: "PENDING",
    states: [
      state("PENDING", 1, { tags: ["initial"], forms: [LINE_ITEM, "DC QC line: count", "DC QC line: exception"] }),
      state("COUNT_CHECK", 2, {
        forms: [LINE_ITEM, "DC QC line: count"],
        actions: [action("QC: count matcher", { failure_policy: { on_failure: "fire_trigger", trigger: "count_mismatched" } })],
      }),
      state("COUNT_MISMATCH", 3, { forms: [LINE_ITEM, "DC QC line: count", "DC QC line: exception"] }),
      state("VERIFIED", 4, { tags: ["terminal"], forms: [LINE_ITEM, "DC QC line: count"], actions: [action("QC: roll up PO")] }),
      state("EXCEPTION", 5, { forms: [LINE_ITEM, "DC QC line: count", "DC QC line: exception", "DC QC line: resolution"], actions: [action("QC: roll up PO")] }),
      state("EXCEPTION_RESOLVED", 6, { tags: ["terminal"], forms: [LINE_ITEM, "DC QC line: exception", "DC QC line: resolution"], actions: [action("QC: roll up PO")] }),
    ],
    transitions: [
      transition("submit_count", "Submit count", "PENDING", "COUNT_CHECK", { required: ["received_qty"], guards: [gte("photo_count", 1)], description: "A count and at least one photo." }),
      transition("count_matched", "Count matches", "COUNT_CHECK", "VERIFIED"),
      transition("count_mismatched", "Count does not match", "COUNT_CHECK", "COUNT_MISMATCH"),
      transition("recount", "Recount", "COUNT_MISMATCH", "PENDING"),
      transition("raise_exception", "Raise exception", "COUNT_MISMATCH", "EXCEPTION", { required: ["exception_reason"] }),
      transition("raise_exception_direct", "Raise exception", "PENDING", "EXCEPTION", { required: ["received_qty", "exception_reason"], description: "Goods that are damaged or wrong even when the count is right." }),
      transition("resolve_exception", "Resolve exception", "EXCEPTION", "EXCEPTION_RESOLVED", { required: ["resolution_note"] }),
    ],
  },
  {
    key: "pallet",
    entity: "dc_pallet",
    name: "DC QC - Pallet",
    description: "A pallet that arrived with a purchase order",
    keys: PALLET_KEYS,
    initial: "OPEN",
    states: [
      state("OPEN", 1, { tags: ["initial"], forms: ["DC QC pallet"] }),
      state("CHECKED", 2, { tags: ["terminal"], forms: ["DC QC pallet"], actions: [action("QC: pallet checked")] }),
    ],
    transitions: [transition("mark_checked", "Pallet checked", "OPEN", "CHECKED")],
  },
];

const machines = {};
for (const wf of WORKFLOWS) {
  const definition = {
    machine_key: `dc_qc_${wf.key}`,
    name: wf.name,
    description: wf.description,
    entity_type: wf.entity,
    service_id: null,
    entity_schema: { entity_type: wf.entity, fields: wf.keys.map(field) },
    states: wf.states,
    method_schemas: [],
    initial_state: wf.initial,
    transitions: wf.transitions,
  };
  const all = await call("GET", "/workflow-state-machines", undefined, token);
  const published = (all.published_items ?? []).find((w) => w.entity_type === wf.entity);
  let rowId;
  if (published) {
    const draft = await call("POST", `/workflow-state-machines/${published.machine_name}/draft`, {}, token);
    rowId = draft.id ?? draft.row_id;
    definition.machine_key = published.definition?.machine_key ?? definition.machine_key;
  } else {
    const stale = (all.draft_items ?? []).find((w) => w.entity_type === wf.entity);
    rowId = stale?.id ?? (await call("POST", "/workflow-state-machines/draft", { name: wf.name, description: wf.description }, token)).id;
  }
  await call("PUT", `/workflow-state-machines/${rowId}/draft`, { definition }, token);
  const verdict = await call("POST", "/workflow-state-machines/validate", definition, token).catch((e) => ({ error: e.message }));
  const issues = verdict.validation_report?.issues ?? verdict;
  console.log(`validation ${wf.name}:`, JSON.stringify(issues).slice(0, 900));
  if (verdict.can_publish === false || verdict.error) throw new Error(`${wf.name} cannot be published yet`);
  const done = await call("POST", `/workflow-state-machines/${rowId}/publish`, { definition }, token);
  machines[wf.key] = done.state_machine?.machine_name ?? published?.machine_name;
  console.log(`workflow published   ${wf.name} -> ${machines[wf.key]} (version ${done.state_machine?.version})`);
}

// ------------------------------------------------------------------ remember the machine names for the app
const env = readFileSync(".env", "utf8");
const exported = { SM_QC_PO_MACHINE_NAME: machines.po, SM_QC_LINE_MACHINE_NAME: machines.line, SM_QC_PALLET_MACHINE_NAME: machines.pallet };
const missing = Object.entries(exported).filter(([k]) => !new RegExp(`^${k}=`, "m").test(env));
if (missing.length) appendFileSync(".env", `\n# DC QC workflows, written by scripts/sm-qc.mjs\n${missing.map(([k, v]) => `${k}=${v}`).join("\n")}\n`);
console.log(JSON.stringify(exported));
