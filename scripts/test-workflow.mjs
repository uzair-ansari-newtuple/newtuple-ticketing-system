// End-to-end test of the connector pipeline in the State Machine. Needs the backend (3001), frontend (3000) and State Machine running.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";

process.loadEnvFile(".env");
const [P1, P2] = JSON.parse(readFileSync("db/seed/products.json", "utf8"));
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
const FIELDS = "identifier,ocr_text,brand,department,gating_tier,candidate_count,edw_candidates,extracted_metadata,selected_candidate,resolver_reason_codes,escalation_note,new_tag_added,closed_at";
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

// ---------------------------------------------------------------- STEP MODE
section("Step mode: the ticket waits at each state");
setMode("step");
await sleep(2000);
const t1 = await capture(goodPhotos());
let s = await waitFor(t1.number, (t) => t.f.ocr_text);
check("ticket appears in the State Machine at CAPTURED", s?.state === "CAPTURED", `${s?.state}`);
check("CAPTURED connector ran: tag text was read", BRAND_TEXT.test(s?.f.ocr_text ?? ""), s?.f.ocr_text);
check("nothing from later stages yet (brand, rating empty)", !s.f.brand && !s.f.gating_tier, JSON.stringify(s.f).slice(0, 160));
await sleep(5000);
s = await ticket(t1.number);
check("it keeps waiting and does not move on by itself", s.state === "CAPTURED", s.state);
const e1 = s.entity;

section("Step mode: clicks out of order are refused");
let r = await fire(e1, "to_ai_identification");
check("CAPTURED cannot jump to AI_IDENTIFICATION", r.s >= 400, `${r.s}`);
r = await fire(e1, "ai_identification_to_new");
check("CAPTURED cannot jump to NEW", r.s >= 400, `${r.s}`);
r = await fire(e1, "to_inprogress");
check("CAPTURED cannot be claimed", r.s >= 400, `${r.s}`);

section("Step mode: click 1, then 2, then 3");
r = await fire(e1, "to_image_mapped");
check("click 1 moves to IMAGE_MAPPED", r.s === 200 && r.b.to_state === "IMAGE_MAPPED", JSON.stringify(r.b)?.slice(0, 120));
s = await waitFor(t1.number, (t) => t.f.brand);
check("IMAGE_MAPPED connector ran: brand and department set", s.f.brand === P1.brand && s.f.department === DEPARTMENT, JSON.stringify(s.f).slice(0, 200));
check("the extracted metadata is valid JSON with the barcode", JSON.parse(s.f.extracted_metadata).Barcode === P1.upc, s.f.extracted_metadata?.slice(0, 120));
check("still no rating before the identify state", !s.f.gating_tier, s.f.gating_tier);
r = await fire(e1, "to_image_mapped");
check("clicking the same step again is refused", r.s >= 400, `${r.s}`);
r = await fire(e1, "to_ai_identification");
check("click 2 moves to AI_IDENTIFICATION", r.s === 200 && r.b.to_state === "AI_IDENTIFICATION", JSON.stringify(r.b)?.slice(0, 120));
s = await waitFor(t1.number, (t) => t.f.gating_tier);
const cands = JSON.parse(s.f.edw_candidates);
check("AI_IDENTIFICATION connector ran: rating and candidates set", ["GREEN", "YELLOW", "RED"].includes(s.f.gating_tier) && Number(s.f.candidate_count) === cands.length && cands.length > 0, JSON.stringify(s.f).slice(0, 200));
check("the product is the top candidate", cands[0].sku === P1.sku, JSON.stringify(cands[0]));
const n = await neon(t1.id);
check("the app's own record agrees (ready to review, same count)", n.current_state === "CANDIDATES_READY" && n.n === cands.length, JSON.stringify(n));
r = await fire(e1, "ai_identification_to_new");
check("click 3 moves to NEW", r.s === 200 && r.b.to_state === "NEW", JSON.stringify(r.b)?.slice(0, 120));
const ar = runs(e1);
check("exactly three connector actions ran, all succeeded", ar.length === 3 && ar.every((x) => x === "webhook.http:succeeded"), ar.join(","));

// ---------------------------------------------------------------- FAILURES (step mode)
section("Step mode: a failing connector stops the ticket and says why");
const analyzeId = await connectorId("Ticketing: analyze photos");
await patchConnector(analyzeId, { secrets: { api_key: "wrong-key" } });
const t2 = await capture(goodPhotos());
await sleep(12000);
s = await ticket(t2.number);
const ar2 = runs(s.entity);
check("wrong key: the action is recorded as failed", ar2.some((x) => x.endsWith(":failed")), ar2.join(","));
check("wrong key: ticket stays in CAPTURED with no data", s.state === "CAPTURED" && !s.f.ocr_text, `${s.state} ${s.f.ocr_text}`);
await patchConnector(analyzeId, { secrets: { api_key: KEY } });
await patchConnector(analyzeId, { base_url: "http://host.docker.internal:9" });
const t3 = await capture(goodPhotos());
await sleep(12000);
s = await ticket(t3.number);
check("backend unreachable: action failed and ticket waits in CAPTURED", runs(s.entity).some((x) => x.endsWith(":failed")) && s.state === "CAPTURED", `${s.state} ${runs(s.entity)}`);
await patchConnector(analyzeId, { base_url: BASE_URL });
const rr = await call(SM, `/entities/${s.entity}/actions/rerun`, { headers: smh, body: {} });
s = await waitFor(t3.number, (t) => t.f.ocr_text, 60000);
check("after the connector is repaired, re-running the action works", s?.f.ocr_text && BRAND_TEXT.test(s.f.ocr_text), `rerun ${rr.s} ${JSON.stringify(s?.f).slice(0, 120)}`);

// ---------------------------------------------------------------- AUTO MODE
section("Auto mode: one capture, the ticket moves through every state alone");
setMode("auto");
await sleep(2000);
const t4 = await capture(goodPhotos());
const started = Date.now();
s = await waitFor(t4.number, (t) => t.state === "NEW" && t.f.gating_tier, 60000);
check("the ticket reaches NEW by itself", s?.state === "NEW", `${s?.state}`);
console.log(`      time to reach NEW: ${Math.round((Date.now() - started) / 1000)} s`);
check("all the data is filled in", s.f.brand === P1.brand && BRAND_TEXT.test(s.f.ocr_text) && Number(s.f.candidate_count) > 0, JSON.stringify(s.f).slice(0, 200));
const ar4 = runs(s.entity);
check("three connector actions ran and all succeeded", ar4.filter((x) => x === "webhook.http:succeeded").length === 3 && !ar4.some((x) => x.endsWith(":failed")), ar4.join(","));
check("the app sees it ready to review", (await neon(t4.id)).current_state === "CANDIDATES_READY");

section("Auto mode: a failing first connector does not block the ticket");
await patchConnector(analyzeId, { secrets: { api_key: "wrong-key" } });
const t5 = await capture(goodPhotos());
s = await waitFor(t5.number, (t) => t.state === "NEW" && t.f.gating_tier, 60000);
check("the ticket still reaches NEW", s?.state === "NEW", `${s?.state}`);
check("later connectors recovered the data (brand, rating)", s?.f.brand === P1.brand && !!s.f.gating_tier, JSON.stringify(s?.f).slice(0, 160));
check("the failed first action is recorded", runs(s.entity).some((x) => x.endsWith(":failed")), runs(s.entity).join(","));
await patchConnector(analyzeId, { secrets: { api_key: KEY } });

section("Auto mode: a photo that matches nothing is rated and still reaches the resolver queue");
const t6 = await capture([photo("public/icon-512.png", "front")]);
s = await waitFor(t6.number, (t) => t.state === "NEW" && t.f.gating_tier, 60000);
check("unrelated photo reaches NEW with a rating", s?.state === "NEW" && ["GREEN", "YELLOW", "RED"].includes(s.f.gating_tier), JSON.stringify(s?.f).slice(0, 160));

// ---------------------------------------------------------------- RESOLVER OUTCOMES
section("Resolver outcomes on auto-moved tickets, and the notifications they send");
const claim = async (t) => { const x = await waitFor(t.number, (v) => v.state === "NEW", 60000); return { ...t, entity: x.entity }; };
const a = await claim(t4);
r = await fire(a.entity, "to_inprogress");
check("claim moves NEW to INPROGRESS", r.s === 200 && r.b.to_state === "INPROGRESS", JSON.stringify(r.b)?.slice(0, 100));
r = await fire(a.entity, "to_resolved");
check("resolving without a selected item is refused", r.s >= 400, `${r.s} ${JSON.stringify(r.b)?.slice(0, 100)}`);
await put(a.entity, { selected_candidate: P1.sku });
r = await fire(a.entity, "to_resolved");
check("resolving with a selected item works", r.s === 200 && r.b.to_state === "RESOLVED", JSON.stringify(r.b)?.slice(0, 100));
await sleep(8000);
let ev = await events(a.id, "NOTIFIED");
check("RESOLVED sent the store a notification", ev.some((d) => d.event === "RESOLUTION_SENT"), JSON.stringify(ev));

const b = await claim(await capture(goodPhotos()));
await fire(b.entity, "to_inprogress");
r = await fire(b.entity, "to_notctmerch");
check("not-CT-merch without a reason is refused", r.s >= 400, `${r.s}`);
await put(b.entity, { resolver_reason_codes: "not_cititrends_merchandise" });
r = await fire(b.entity, "to_notctmerch");
check("not-CT-merch with a reason works", r.s === 200 && r.b.to_state === "NOT_CT_MERCH", JSON.stringify(r.b)?.slice(0, 100));
await sleep(8000);
check("NOT_CT_MERCH sent the store a notification", (await events(b.id, "NOTIFIED")).some((d) => d.event === "RESOLUTION_SENT"));
r = await fire(b.entity, "NOT_CT_MERCH_to_NEEDS_L2");
check("a closed ticket can be sent up to L2", r.s === 200 && r.b.to_state === "NEEDS_L2", JSON.stringify(r.b)?.slice(0, 100));
await sleep(8000);
check("NEEDS_L2 sent resolvers a notification", (await events(b.id, "NOTIFIED")).some((d) => d.event === "L2_ESCALATED"));
r = await fire(b.entity, "claim_l2");
check("an L2 resolver can claim it", r.s === 200 && r.b.to_state === "INPROGRESS", JSON.stringify(r.b)?.slice(0, 100));

const c = await claim(await capture(goodPhotos()));
await fire(c.entity, "to_inprogress");
await put(c.entity, { resolver_reason_codes: "no_match_found" });
r = await fire(c.entity, "to_cantresolve");
check("can't-resolve with a reason works", r.s === 200 && r.b.to_state === "CANT_RESOLVE");
await sleep(8000);
check("CANT_RESOLVE sent the store a notification", (await events(c.id, "NOTIFIED")).length >= 1);
r = await fire(c.entity, "CANT_RESOLVE_to_NEW");
check("a can't-resolve ticket can be reopened to NEW", r.s === 200 && r.b.to_state === "NEW");

const d = await claim(await capture(goodPhotos()));
await fire(d.entity, "to_inprogress");
r = await fire(d.entity, "escalate_to_l2");
check("escalating to L2 without a note is refused", r.s >= 400, `${r.s}`);
await put(d.entity, { escalation_note: "needs a second opinion" });
r = await fire(d.entity, "escalate_to_l2");
check("escalating to L2 with a note works", r.s === 200 && r.b.to_state === "NEEDS_L2");
r = await fire(d.entity, "to_new");
check("a ticket in NEEDS_L2 cannot be released to NEW", r.s >= 400, `${r.s}`);

// ---------------------------------------------------------------- STORE RESOLVES ITSELF
section("A store that picks the right item itself finishes the ticket in the State Machine");
const g = await capture(goodPhotos());
s = await waitFor(g.number, (t) => t.state === "NEW" && t.f.gating_tier, 60000);
check("the ticket waits in NEW with a rating", s?.state === "NEW", `${s?.state}`);
const firstKey = (await detailOf(g.id)).candidates[0].key;
const cf = await call(APP, `/mock/incidents/${g.id}/confirm`, { headers: auth, body: { acknowledged: true, candidate_key: firstKey } });
check("the store confirms the match", cf.s === 200, `${cf.s} ${JSON.stringify(cf.b)}`);
s = await waitFor(g.number, (t) => t.state === "RESOLVED", 20000);
check("the State Machine moves the ticket to RESOLVED", s?.state === "RESOLVED", `${s?.state}`);
check("the selected item is saved on the ticket", s?.f.selected_candidate === P1.sku, `${s?.f.selected_candidate}`);
const pr = await call(APP, "/mock/label-print", { headers: auth, body: { incident_id: g.id, printer: 1, copies: 1 } });
check("the label can still be printed after it is resolved", pr.s === 200, `${pr.s} ${JSON.stringify(pr.b)}`);
const tg = await call(APP, `/mock/incidents/${g.id}/new-tag-added`, { headers: auth, body: {} });
check("the new tag can still be confirmed", tg.s === 200, `${tg.s}`);
s = await waitFor(g.number, (t) => String(t.f.new_tag_added) === "true", 20000);
check("the ticket stays RESOLVED and records the new tag and closing time", s?.state === "RESOLVED" && !!s.f.closed_at, JSON.stringify(s?.f).slice(0, 160));
check("the app shows it as COMPLETED", (await detailOf(g.id)).state === "COMPLETED");
check("no resolver message was sent for a ticket the store resolved itself", (await events(g.id, "NOTIFIED")).length === 0);
const late = await call(APP, `/mock/incidents/${g.id}/escalate`, { headers: auth, body: { reason: "USER_UNSURE", item_age: "NEW_FREIGHT", missing_price_tag_count: 1 } });
check("a ticket that is already resolved cannot be escalated", late.s === 409, `${late.s}`);

// ---------------------------------------------------------------- APP END TO END
section("The app itself works on top of the auto workflow");
const e = await capture(goodPhotos());
s = await waitFor(e.number, (t) => t.state === "NEW" && t.f.gating_tier, 60000);
check("a ticket captured in the app reaches NEW", s?.state === "NEW");
const esc = await call(APP, `/mock/incidents/${e.id}/escalate`, { headers: auth, body: { reason: "USER_UNSURE", item_age: "NEW_FREIGHT", missing_price_tag_count: 2 } });
check("the store can escalate it", esc.s === 200, `${esc.s}`);
const cl = await call(APP, `/mock/resolver/incidents/${e.id}/claim`, { headers: rauth });
check("a resolver can claim it in the app", cl.s === 200, `${cl.s} ${JSON.stringify(cl.b)?.slice(0, 100)}`);
await sleep(6000);
s = await ticket(e.number);
check("the State Machine shows it INPROGRESS", s.state === "INPROGRESS", s.state);
const rec = await call(SM, `/entity-records/${s.entity}`, { method: "GET", headers: smh });
check("the State Machine assignee is the resolver who claimed it", rec.b?.assignee_id === resolverLogin.user.id, `${rec.b?.assignee_id} vs ${resolverLogin.user.id}`);
const rs = await call(APP, `/mock/resolver/incidents/${e.id}/respond`, { headers: rauth, body: { decision: "RECOMMEND", sku: P2.sku, comment: "matches" } });
check("the resolver can answer", rs.s === 200, `${rs.s}`);
s = await waitFor(e.number, (t) => t.state === "RESOLVED", 30000);
check("the State Machine shows it RESOLVED", s?.state === "RESOLVED", s?.state);

// leave the workflow the way the user asked for it: step mode
section("Restore step mode");
setMode("step");
check("step mode is published again", true);

console.log(`\nTOTAL ${total}  PASS ${total - failures}  FAIL ${failures}`);
process.exit(failures ? 1 : 0);
