// Deletes every ticket, quality check and ticket photo from the State Machine. Users, roles, store assignments,
// the workflow, connectors, forms and picklists are left alone.
//   node scripts/sm-clean.mjs --yes
process.loadEnvFile(".env");

if (!process.argv.includes("--yes")) {
  console.log("This deletes ALL tickets, quality checks and photos in the State Machine. Run again with --yes to go ahead.");
  process.exit(1);
}

const BASE = process.env.SM_BASE_URL;
const call = async (method, path, body, token) => {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json;
};
const PAGE = 200;

const { access_token: token } = await call("POST", "/auth/login", { email: process.env.SM_EMAIL, password: process.env.SM_PASSWORD });

async function deleteAll(label, listPage, remove) {
  let total = 0;
  for (;;) {
    const ids = await listPage();
    if (!ids.length) break;
    for (let i = 0; i < ids.length; i += 10) await Promise.all(ids.slice(i, i + 10).map(remove));
    total += ids.length;
  }
  console.log(`deleted ${String(total).padStart(4)} ${label}`);
}

await deleteAll(
  "photo files",
  async () => (await call("POST", "/filehandler/list", { type_id: "incident_photo", limit: PAGE }, token)).items.map((f) => f.file_id),
  (id) => fetch(`${BASE}/filehandler/${id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } }),
);
for (const [type, label] of [["incident", "tickets"], ["quality_check", "quality checks"]]) {
  await deleteAll(
    label,
    async () => (await call("GET", `/entity-records?entity_type_name=${type}&limit=${PAGE}`, undefined, token)).items.map((r) => r.entity_id),
    (id) => call("DELETE", `/entity-records/${id}`, undefined, token),
  );
}
