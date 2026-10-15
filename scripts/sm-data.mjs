// Creates what the ticketing app stores in the State Machine besides the tickets themselves. Safe to run again.
//   - file type "incident_photo": the photos taken for a ticket
//   - entity type "quality_check": one short-lived record per photo quality check
//   - file type "product_photo", entity type "catalog_product" and the one-state workflow "Product catalog": the product catalog
process.loadEnvFile(".env");

const BASE = process.env.SM_BASE_URL;
const call = async (method, path, body, token) => {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
  return json;
};
const rows = (x) => (Array.isArray(x) ? x : x?.items ?? []);

const { access_token: token } = await call("POST", "/auth/login", { email: process.env.SM_EMAIL, password: process.env.SM_PASSWORD });

const fileTypes = rows(await call("GET", "/config/file-types", undefined, token));
if (fileTypes.some((t) => t.type_id === "incident_photo")) console.log("file type exists    incident_photo");
else {
  await call("POST", "/config/file-types", { type_id: "incident_photo", display_name: "Incident photo", description: "Photos taken for a missing-tag ticket", folder: "incident-photos", allowed_extensions: [".jpg", ".jpeg", ".png"], max_size_mb: 10 }, token);
  console.log("file type created   incident_photo");
}

const types = rows(await call("GET", "/entity-types?limit=200", undefined, token));
if (types.some((t) => t.name === "quality_check")) console.log("entity type exists  quality_check");
else {
  await call("POST", "/entity-types", { name: "quality_check", description: "A photo quality check. Valid for 15 minutes and used once to create a ticket." }, token);
  console.log("entity type created quality_check");
}

if (fileTypes.some((t) => t.type_id === "product_photo")) console.log("file type exists    product_photo");
else {
  await call("POST", "/config/file-types", { type_id: "product_photo", display_name: "Product photo", description: "Catalog photo of a product", folder: "product-photos", allowed_extensions: [".jpg", ".jpeg", ".png"], max_size_mb: 10 }, token);
  console.log("file type created   product_photo");
}

if (types.some((t) => t.name === "catalog_product")) console.log("entity type exists  catalog_product");
else {
  await call("POST", "/entity-types", { name: "catalog_product", description: "A product the matcher knows: a catalog item or one a store added from a ticket" }, token);
  console.log("entity type created catalog_product");
}

// A workflow with a single state gives the catalog paging, filters, search and counts through the enrollments list.
const CATALOG_MACHINE = "product_catalog";
const field = (name, type = "string") => ({ field: name, type, required: false, nullable: true, default: null, enum_values: [], enum_labels: [], picklist_id: null, picklist_id_2: null, enum_values_2: [], enum_labels_2: [], source_states: [] });
const definition = {
  machine_key: CATALOG_MACHINE,
  name: "Product catalog",
  description: "Products the photo matcher knows",
  entity_type: "catalog_product",
  service_id: null,
  entity_schema: {
    entity_type: "catalog_product",
    fields: [field("sku"), field("upc"), field("name"), field("brand"), field("class_code"), field("color_code"), field("price_cents", "int"), field("active"), field("kind"), field("store_id"), field("metadata", "text"), field("thumb", "text"), field("embeddings", "text")],
  },
  states: [
    { name: "ACTIVE", tags: ["initial"], order: 1, on_state_actions: [] },
    { name: "RETIRED", tags: ["terminal"], order: 2, on_state_actions: [] },
  ],
  method_schemas: [],
  initial_state: "ACTIVE",
  transitions: [{ key: "active__to__retired", trigger: "retire", label: "Retire", from: "ACTIVE", to_state: "RETIRED", required_fields: [], guards: [], pre_transition_tasks: [], post_transition_tasks: [], auto_transition: null, description: "The product is no longer matched." }],
};
const all = await call("GET", "/workflow-state-machines", undefined, token);
const existing = (all.published_items ?? []).find((w) => w.entity_type === "catalog_product");
if (existing) console.log(`workflow exists     ${existing.machine_name}`);
else {
  const staleDraft = (all.draft_items ?? []).find((w) => w.entity_type === "catalog_product");
  const rowId = staleDraft?.id ?? (await call("POST", "/workflow-state-machines/draft", { name: "Product catalog", description: "Products the photo matcher knows" }, token)).id;
  await call("PUT", `/workflow-state-machines/${rowId}/draft`, { definition }, token);
  const verdict = await call("POST", "/workflow-state-machines/validate", definition, token).catch((e) => ({ error: e.message }));
  console.log("validation:", JSON.stringify(verdict.validation_report?.issues ?? verdict).slice(0, 600));
  const published = await call("POST", `/workflow-state-machines/${rowId}/publish`, { definition }, token);
  console.log(`workflow created    ${published.state_machine?.machine_name}`);
}
