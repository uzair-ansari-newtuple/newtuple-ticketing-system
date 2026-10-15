// Creates what the ticketing app stores in the State Machine besides the tickets themselves. Safe to run again.
//   - file type "incident_photo": the photos taken for a ticket
//   - entity type "quality_check": one short-lived record per photo quality check
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
