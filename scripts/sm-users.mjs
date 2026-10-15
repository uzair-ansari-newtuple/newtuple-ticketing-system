// Sets up who can sign in to the ticketing app, entirely inside the State Machine. Safe to run again.
//   - entity type "store_assignment": one record per store user (email, store id, store name)
//   - roles "store_associate" and "resolver"
//   - records for the store users listed in STORE_USERS
process.loadEnvFile(".env");

const BASE = process.env.SM_BASE_URL;
const call = async (method, path, body, token) => {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
  return json;
};
const rows = (x) => (Array.isArray(x) ? x : x?.items ?? []);

const STORE_USERS = [{ email: process.env.DEMO_STORE_EMAIL ?? process.env.SM_EMAIL, store_id: "ST-112", store_name: "Store #112 · Atlanta, GA" }];
const ROLES = [
  { name: "store_associate", display_name: "Store Associate", description: "Store staff who capture and track missing-tag tickets", priority: 20, color: "#2563EB" },
  { name: "resolver", display_name: "Resolver", description: "Resolver desk staff who identify items for stores", priority: 30, color: "#7C3AED" },
];

const { access_token: token } = await call("POST", "/auth/login", { email: process.env.SM_EMAIL, password: process.env.SM_PASSWORD });

const types = rows(await call("GET", "/entity-types?limit=200", undefined, token));
if (types.some((t) => t.name === "store_assignment")) console.log("entity type exists  store_assignment");
else {
  await call("POST", "/entity-types", { name: "store_assignment", description: "Which store a ticketing app user belongs to" }, token);
  console.log("entity type created store_assignment");
}

const roles = rows(await call("GET", "/roles", undefined, token));
for (const r of ROLES) {
  if (roles.some((x) => x.name === r.name)) { console.log(`role exists         ${r.name}`); continue; }
  await call("POST", "/roles", r, token);
  console.log(`role created        ${r.name}`);
}

const type = await call("GET", "/entity-types/store_assignment", undefined, token);
for (const u of STORE_USERS) {
  const found = rows(await call("GET", `/entity-records?entity_type_name=store_assignment&search=${encodeURIComponent(u.email)}&limit=10`, undefined, token)).find((r) => r.data?.user_email === u.email);
  const data = { identifier: u.email, user_email: u.email, store_id: u.store_id, store_name: u.store_name };
  if (found) { await call("PUT", `/entity-records/${found.entity_id}`, { data }, token); console.log(`assignment updated  ${u.email} -> ${u.store_id}`); }
  else { await call("POST", "/entity-records", { entity_type_id: type.entity_type_id, data }, token); console.log(`assignment created  ${u.email} -> ${u.store_id}`); }
}
