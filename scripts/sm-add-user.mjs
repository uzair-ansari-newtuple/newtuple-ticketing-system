// Creates a user for the ticketing app in the State Machine: registers it, approves it, gives it its role and,
// for a store user, assigns its store. The generated password is saved in .env.
//   node scripts/sm-add-user.mjs "Full Name" email@company.com store ST-112 "Store #112 · Atlanta, GA"
//   node scripts/sm-add-user.mjs "Full Name" email@company.com resolver
import { appendFileSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

process.loadEnvFile(".env");
const [name, email, kind, storeId, storeName] = process.argv.slice(2);
if (!name || !email || !["store", "resolver"].includes(kind) || (kind === "store" && !storeId)) {
  console.log('Usage: node scripts/sm-add-user.mjs "Full Name" email store <store id> ["Store name"]   |   ... email resolver');
  process.exit(1);
}

const BASE = process.env.SM_BASE_URL;
const call = async (method, path, body, token) => {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json;
};
const rows = (x) => (Array.isArray(x) ? x : x?.items ?? []);

const { access_token: token } = await call("POST", "/auth/login", { email: process.env.SM_EMAIL, password: process.env.SM_PASSWORD });

const key = `USER_PASSWORD_${email.replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}`;
const existing = readFileSync(".env", "utf8").match(new RegExp(`^${key}=(.*)$`, "m"))?.[1];
const password = existing ?? `${randomBytes(9).toString("base64url")}Aa1`;

const found = rows(await call("GET", `/users/search?q=${encodeURIComponent(email)}`, undefined, token)).find((u) => u.email.toLowerCase() === email.toLowerCase());
let user = found;
if (!user) {
  const reg = await call("POST", "/auth/register", { email, password, full_name: name, role: "viewer" });
  user = { id: reg.user_id };
  if (!existing) appendFileSync(".env", `${key}=${password}\n`);
  console.log(`registered   ${email}`);
} else console.log(`already there ${email}`);

if (user.status !== "active") await call("POST", `/users/${user.id}/approve`, { role: "viewer" }, token).then(() => console.log("approved"), (e) => console.log("approve:", e.message.slice(0, 120)));

const role = kind === "store" ? "store_associate" : "resolver";
const roleId = rows(await call("GET", "/roles", undefined, token)).find((r) => r.name === role).id;
await call("PUT", `/roles/users/${user.id}/role`, { role_id: roleId }, token);
console.log(`role         ${role}`);

if (kind === "store") {
  const type = await call("GET", "/entity-types/store_assignment", undefined, token);
  const have = rows(await call("GET", `/entity-records?entity_type_name=store_assignment&search=${encodeURIComponent(email)}&limit=10`, undefined, token)).find((r) => r.data?.user_email === email);
  const data = { identifier: email, user_email: email, store_id: storeId, store_name: storeName ?? storeId };
  if (have) await call("PUT", `/entity-records/${have.entity_id}`, { data }, token);
  else await call("POST", "/entity-records", { entity_type_id: type.entity_type_id, data }, token);
  console.log(`store        ${storeId}`);
}
console.log(existing ? "password: unchanged, see .env" : `password saved in .env as ${key}`);
