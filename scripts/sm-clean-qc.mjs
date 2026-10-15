// Deletes every DC QC record (flags, pallets, UPCs, shipments) and the UPC photos, so the demo can start again.
//   node scripts/sm-clean-qc.mjs --yes
process.loadEnvFile(".env");
if (!process.argv.includes("--yes")) throw new Error("This deletes all DC QC data. Run it again with --yes to confirm.");

const BASE = process.env.SM_BASE_URL;
const call = async (method, path, body, token) => {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json;
};
const { access_token: token } = await call("POST", "/auth/login", { email: process.env.SM_EMAIL, password: process.env.SM_PASSWORD });

for (const type of ["dcqc_notification", "dcqc_flag", "pallet"]) {
  let deleted = 0;
  for (;;) {
    const { items } = await call("GET", `/entity-records?entity_type_name=${type}&limit=100`, undefined, token);
    if (!items.length) break;
    for (const item of items) {
      await call("DELETE", `/entity-records/${item.entity_id}`, undefined, token);
      deleted++;
    }
  }
  console.log(`deleted ${deleted} ${type}`);
}
for (const [machine, type] of [[process.env.SM_DCQC_UPC_MACHINE_NAME, "upc"], [process.env.SM_DCQC_SHIPMENT_MACHINE_NAME, "shipment"]]) {
  let deleted = 0, photos = 0;
  for (;;) {
    const { items } = await call("GET", `/workflow-enrollments?machine_name=${machine}&entity_type_name=${type}&fields=identifier&limit=100`, undefined, token);
    if (!items.length) break;
    for (const item of items) {
      if (type === "upc") {
        const files = await call("POST", "/filehandler/list", { owner_entity_id: item.entity_id, type_id: "qc_photo" }, token);
        for (const f of files.items) {
          await call("DELETE", `/filehandler/${f.file_id}`, undefined, token);
          photos++;
        }
      }
      await call("DELETE", `/entity-records/${item.entity_id}`, undefined, token);
      deleted++;
    }
  }
  console.log(`deleted ${deleted} ${type}${photos ? ` and ${photos} photos` : ""}`);
}
