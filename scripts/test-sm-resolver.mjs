// A resolver who works a ticket only in the State Machine: the store app must follow. Needs the backend (3001), frontend (3000) and State Machine running.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";

process.loadEnvFile(".env");
const [P1, P2] = JSON.parse(readFileSync("data/products.json", "utf8"));
const DEPARTMENT = "General Merchandise";
const BRAND_TEXT = new RegExp(P1.brand, "i");
const APP = "http://localhost:3000/api", SM = process.env.SM_BASE_URL, MACHINE = process.env.SM_MACHINE_NAME ?? "workflow_dguyp0t8_9f7jus";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (base, path, o = {}) => {
  const res = await fetch(base + path, { method: o.method ?? "POST", headers: { "content-type": "application/json", ...(o.headers ?? {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
  return { s: res.status, b: await res.json().catch(() => null) };
};
let failures = 0, total = 0;
const check = (name, ok, detail = "") => { total++; if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`); };
const section = (t) => console.log(`\n== ${t} ==`);

const login = (await call(APP, "/mock/auth/login", { body: { email: process.env.DEMO_STORE_EMAIL, password: process.env.DEMO_STORE_PASSWORD } })).b;
const auth = { authorization: `Bearer ${login.access_token}` };
const resolverLogin = (await call(APP, "/mock/auth/login", { body: { email: process.env.DEMO_RESOLVER_EMAIL, password: process.env.DEMO_RESOLVER_PASSWORD } })).b;
const rauth = { authorization: `Bearer ${resolverLogin.access_token}` };
const smTok = (await call(SM, "/auth/login", { body: { email: process.env.SM_EMAIL, password: process.env.SM_PASSWORD } })).b.access_token;
const smh = { authorization: `Bearer ${smTok}` };

let seq = 0;
const photo = (path, slot) => {
  const buf = Buffer.concat([readFileSync(path), Buffer.from(`${++seq}-${Date.now()}`)]);
  const sha = createHash("sha256").update(buf).digest("hex");
  return { client_image_id: `p${seq}`, slot, mime_type: "image/jpeg", image_base64: buf.toString("base64"), sha256: sha, quality_hint: { blur_score: 80, brightness: 140, width: 1200, height: 1200 },
    capture: { fileName: "t.jpg", source: "uploaded", mimeType: "image/jpeg", originalBytes: buf.length, compressedBytes: buf.length, width: 1200, height: 1200, sha256: sha, capturedAt: null, device: null, orientation: null, gps: null } };
};
async function capture(images) {
  const q = await call(APP, "/mock/quality-check", { headers: auth, body: { images } });
  for (let i = 0; i < 30; i++) { if ((await call(APP, `/mock/jobs/${q.b.job_id}`, { method: "GET", headers: auth })).b.status === "completed") break; await sleep(500); }
  const analysis = { model: "pending", match: null, top_matches: [], match_threshold: 0.88, classification: null, ocr: null, error: null };
  const c = (await call(APP, "/mock/incidents", { headers: auth, body: { quality_check_id: q.b.job_id, images, client_analysis: analysis, embeddings: [] } })).b;
  return { id: c.incident_id, number: c.incident_number_display };
}
const goodPhotos = () => [photo(`public/catalog/${P1.sku}.jpg`, "front"), photo(`public/catalog/tags/${P1.sku}-tag.jpg`, "tag")];
const FIELDS = "identifier,ocr_text,brand,department,gating_tier,candidate_count,edw_candidates,extracted_metadata,selected_candidate,resolver_reason_codes,escalation_note,new_tag_added,closed_at,store_name,created_by_user_id,photos,photo_urls";
async function ticket(number) {
  const r = await call(SM, `/workflow-enrollments?machine_name=${MACHINE}&search=${number}&limit=5&fields=${FIELDS}`, { method: "GET", headers: smh });
  const it = r.b?.items?.find((i) => i.summary_fields.identifier === number);
  return it ? { entity: it.entity_id, state: it.current_state, f: it.summary_fields } : null;
}
async function waitFor(number, pred, ms = 40000) {
  const until = Date.now() + ms; let t = null;
  while (Date.now() < until) { t = await ticket(number); if (t && pred(t)) return t; await sleep(1000); }
  return t;
}
const fire = (entity, trigger) => call(SM, `/entities/${entity}/transitions`, { headers: smh, body: { entity_id: entity, trigger, idempotency_key: randomUUID(), inputs: {} } });
const put = (entity, data) => call(SM, `/entity-records/${entity}`, { method: "PUT", headers: smh, body: { data } });
const runs = (entity) => execSync(`docker exec state-machine-modular-modular-db-1 psql -U statemachine -d statemachine -At -c "select action_kind||':'||status from modular_backend.action_runs where entity_id='${entity}' order by created_at"`).toString().trim().split("\n").filter(Boolean);
const detailOf = async (id) => (await call(APP, `/mock/incidents/${id}`, { method: "GET", headers: auth })).b;
const neon = async (id) => { const d = await detailOf(id); return { current_state: d.state, gating: d.gating, n: d.candidates.length }; };
const events = async (id, type) => (await detailOf(id)).events.filter((e) => e.type === type).map((e) => e.detail);
const setMode = (mode) => execSync(`node scripts/sm-workflow.mjs --mode ${mode} --publish`, { stdio: "pipe" });
const connectorId = async (name) => { const l = (await call(SM, "/connectors", { method: "GET", headers: smh })).b; return (Array.isArray(l) ? l : l.items).find((c) => c.name === name).id; };
const patchConnector = (id, body) => call(SM, `/connectors/${id}`, { method: "PATCH", headers: smh, body });
const KEY = process.env.SM_CONNECTOR_KEY, BASE_URL = process.env.SM_CONNECTOR_BASE_URL ?? "http://host.docker.internal:3001";


setMode("step");
await sleep(2000);
const toNew = async (id, number) => {
  let t = await waitFor(number, (x) => x.f.ocr_text);
  for (const trigger of ["to_image_mapped", "to_ai_identification"]) {
    await fire(t.entity, trigger);
    await sleep(3000);
  }
  t = await waitFor(number, (x) => x.f.gating_tier);
  await fire(t.entity, "ai_identification_to_new");
  return (await waitFor(number, (x) => x.state === "NEW")).entity;
};
const escalate = (id) => call(APP, `/mock/incidents/${id}/escalate`, { headers: auth, body: { reason: "USER_UNSURE", item_age: "NEW_FREIGHT", missing_price_tag_count: 1 } });

section("The resolver recommends an item from the State Machine");
const a = await capture(goodPhotos());
const ea = await toNew(a.id, a.number);
check("the store escalates the ticket", (await escalate(a.id)).s === 200);
check("the store sees it waiting for a resolver", (await detailOf(a.id)).state === "ESCALATED");
let r = await call(SM, `/entity-records/${ea}/assignee`, { method: "PUT", headers: smh, body: { assignee_id: resolverLogin.user.id } });
r = await fire(ea, "to_inprogress");
check("the resolver claims it in the State Machine", r.s === 200, JSON.stringify(r.b)?.slice(0, 160));
await sleep(3000);
let d = await detailOf(a.id);
check("the store app now shows it as being worked on", d.state === "RESOLUTION_IN_PROGRESS" && d.resolver?.status === "IN_PROGRESS", `${d.state}`);
r = await fire(ea, "to_resolved");
check("answering without choosing an item is refused", r.s >= 400, `${r.s}`);
await put(ea, { selected_candidate: P2.sku, resolver_comment: "This is the right item", resolver_decision: "resolved" });
r = await fire(ea, "to_resolved");
check("the resolver resolves it in the State Machine", r.s === 200 && r.b.to_state === "RESOLVED", JSON.stringify(r.b)?.slice(0, 160));
await sleep(4000);
d = await detailOf(a.id);
check("the store app received the answer", d.state === "RESOLVER_RESPONSE_RECEIVED" && d.resolver?.decision === "RECOMMEND", `${d.state} ${d.resolver?.decision}`);
check("the recommended item is the one the resolver chose", d.resolver?.recommended?.Barcode === P2.upc || d.resolver?.recommended?.SKU === P2.sku, JSON.stringify(d.resolver?.recommended)?.slice(0, 160));
check("the resolver's comment reached the store", d.resolver?.comment === "This is the right item", d.resolver?.comment);
check("the store has an unread answer and an inbox message", d.unread && (await events(a.id, "NOTIFIED")).some((e) => e.event === "RESOLUTION_SENT"), JSON.stringify(d.unread));

section("The resolver says it is not Citi Trends merchandise, from the State Machine");
const b = await capture(goodPhotos());
const eb = await toNew(b.id, b.number);
await escalate(b.id);
await call(SM, `/entity-records/${eb}/assignee`, { method: "PUT", headers: smh, body: { assignee_id: resolverLogin.user.id } });
await fire(eb, "to_inprogress");
await put(eb, { resolver_reason_codes: "not_cititrends_merchandise", resolver_comment: "Not ours" });
r = await fire(eb, "to_notctmerch");
check("the resolver closes it as not CT merchandise", r.s === 200 && r.b.to_state === "NOT_CT_MERCH", JSON.stringify(r.b)?.slice(0, 160));
await sleep(4000);
d = await detailOf(b.id);
check("the store app shows that answer", d.state === "RESOLVER_RESPONSE_RECEIVED" && d.resolver?.decision === "NOT_APPAREL", `${d.state} ${d.resolver?.decision}`);

section("A ticket the store resolves itself is left alone");
const c = await capture(goodPhotos());
const ec = await toNew(c.id, c.number);
const key = (await detailOf(c.id)).candidates[0].key;
await call(APP, `/mock/incidents/${c.id}/confirm`, { headers: auth, body: { acknowledged: true, candidate_key: key } });
await sleep(4000);
d = await detailOf(c.id);
check("a store pick stays a store pick", d.state === "CONFIRMED" && !d.resolver?.decision, `${d.state}`);

section("Restore");
setMode("step");
console.log(`\nTOTAL ${total}  PASS ${total - failures}  FAIL ${failures}`);
process.exit(failures ? 1 : 0);
