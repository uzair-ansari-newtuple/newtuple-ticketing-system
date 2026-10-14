// Registers the ticketing app's connectors in the State Machine. Safe to run again: connectors are matched by name.
process.loadEnvFile(".env");

const BASE = process.env.SM_BASE_URL;
const APP_URL = process.env.SM_CONNECTOR_BASE_URL ?? "http://host.docker.internal:3000";
const KEY = process.env.SM_CONNECTOR_KEY;
if (!BASE || !KEY || !process.env.SM_EMAIL || !process.env.SM_PASSWORD) throw new Error("SM_BASE_URL, SM_EMAIL, SM_PASSWORD and SM_CONNECTOR_KEY must be set in .env");

const call = async (method, path, body, token) => {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json;
};

const BODY = { incident_id: "$entity.bot_service_incident_id" };
export const CONNECTORS = [
  {
    name: "Ticketing: analyze photos",
    path: "/api/sm/analyze",
    response_mapping: { ocr_text: "ocr_text" },
  },
  {
    name: "Ticketing: map attributes",
    path: "/api/sm/map-attributes",
    response_mapping: { brand: "brand", department: "department", extracted_metadata: "extracted_metadata_json" },
  },
  {
    name: "Ticketing: identify candidates",
    path: "/api/sm/identify",
    response_mapping: { gating_tier: "gating_tier", candidate_count: "candidate_count", edw_candidates: "edw_candidates_json" },
  },
  {
    name: "Ticketing: look up product by barcode",
    path: "/api/sm/gtin-lookup",
    body: { gtin: "$entity.gtin" },
    response_mapping: {},
    expose_as_tool: true,
  },
  {
    name: "Ticketing: print label",
    path: "/api/sm/print-label",
    body: { incident_id: "$entity.bot_service_incident_id" },
    response_mapping: {},
  },
  {
    name: "Ticketing: notify store",
    path: "/api/sm/notify",
    body: { incident_id: "$entity.bot_service_incident_id", event: "RESOLUTION_SENT" },
    response_mapping: {},
  },
];

const { access_token: token } = await call("POST", "/auth/login", { email: process.env.SM_EMAIL, password: process.env.SM_PASSWORD });
const existing = await call("GET", "/connectors", undefined, token);
const items = Array.isArray(existing) ? existing : existing.items ?? [];

const ids = {};
for (const c of CONNECTORS) {
  const payload = {
    name: c.name,
    entity_types: ["incident"],
    base_url: APP_URL,
    method: "POST",
    path: c.path,
    content_type: "application/json",
    body_template: c.body ?? BODY,
    auth_type: "api_key",
    auth_config: { in: "header", name: "X-API-Key" },
    secrets: { api_key: KEY },
    response_mapping: c.response_mapping,
    expose_as_tool: Boolean(c.expose_as_tool),
    success_when: { status_in: [200], json_path: "ok", equals: "True" },
  };
  const found = items.find((x) => x.name === c.name);
  const saved = found ? await call("PATCH", `/connectors/${found.id ?? found.connector_id}`, payload, token) : await call("POST", "/connectors", payload, token);
  ids[c.name] = saved.id ?? saved.connector_id ?? found?.id;
  console.log(`${found ? "updated" : "created"}  ${c.name}  ${ids[c.name]}`);
}
console.log(JSON.stringify(ids));
