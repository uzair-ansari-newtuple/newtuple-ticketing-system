// DC QC flow in the State Machine: fetch POs, start QC, verify UPCs, count matcher, exceptions, QC complete.
// Needs the backend (3001) and the State Machine running, and scripts/sm-qc.mjs to have been run.
import { randomUUID } from "node:crypto";

process.loadEnvFile(".env");
const SM = process.env.SM_BASE_URL, APP = "http://localhost:3001/api";
const M = { po: process.env.SM_QC_PO_MACHINE_NAME, line: process.env.SM_QC_LINE_MACHINE_NAME, pallet: process.env.SM_QC_PALLET_MACHINE_NAME };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0, total = 0;
const check = (name, ok, detail = "") => { total++; if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`); };
const section = (t) => console.log(`\n== ${t} ==`);

const call = async (base, path, o = {}) => {
  const res = await fetch(base + path, { method: o.method ?? "GET", headers: { "content-type": "application/json", ...(o.headers ?? {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
  return { s: res.status, b: await res.json().catch(() => null) };
};
const smTok = (await call(SM, "/auth/login", { method: "POST", body: { email: process.env.SM_EMAIL, password: process.env.SM_PASSWORD } })).b.access_token;
const h = { authorization: `Bearer ${smTok}` };
const list = async (machine, type, filters, fields = "identifier") => {
  const q = new URLSearchParams({ machine_name: machine, entity_type_name: type, fields, limit: "200" });
  if (filters) q.set("field_filters", JSON.stringify(filters));
  return (await call(SM, `/workflow-enrollments?${q}`, { headers: h })).b.items.map((i) => ({ id: i.entity_id, state: i.current_state, f: i.summary_fields }));
};
const record = async (id) => (await call(SM, `/entity-records/${id}`, { headers: h })).b;
const put = (id, data) => call(SM, `/entity-records/${id}`, { method: "PUT", headers: h, body: { data } });
const fire = (id, trigger) => call(SM, `/entities/${id}/transitions`, { method: "POST", headers: h, body: { entity_id: id, trigger, idempotency_key: randomUUID(), inputs: {} } });
const stateOf = async (machine, type, id) => (await list(machine, type)).find((x) => x.id === id)?.state;
const waitState = async (machine, type, id, want, ms = 20000) => {
  const until = Date.now() + ms; let s;
  while (Date.now() < until) { s = await stateOf(machine, type, id); if (s === want) return s; await sleep(700); }
  return s;
};
const dataOf = async (id) => (await record(id)).data;

section("Clean start");
for (const [m, t] of [[M.line, "dc_upc_line"], [M.pallet, "dc_pallet"], [M.po, "dc_po"]]) for (const x of await list(m, t)) await call(SM, `/entity-records/${x.id}`, { method: "DELETE", headers: h });
check("no QC records are left", (await list(M.po, "dc_po")).length === 0);

section("Fetch POs");
const key = { "x-api-key": process.env.SM_CONNECTOR_KEY };
check("fetching without the connector key is refused", (await call(APP, "/sm/qc/fetch-pos", { method: "POST", body: {} })).s === 401);
const fetched = await call(APP, "/sm/qc/fetch-pos", { method: "POST", headers: key, body: {} });
check("fetching creates the four sample POs", fetched.s === 200 && fetched.b.created.length === 4, JSON.stringify(fetched.b));
const again = await call(APP, "/sm/qc/fetch-pos", { method: "POST", headers: key, body: {} });
check("fetching again creates nothing new", again.b.created.length === 0 && again.b.existing.length === 4, JSON.stringify(again.b));
const pos = await list(M.po, "dc_po", null, "po_number,supplier,line_count,unit_count,pending_count");
check("all four POs start in FETCHED", pos.length === 4 && pos.every((p) => p.state === "FETCHED"), JSON.stringify(pos.map((p) => p.state)));
const po1 = pos.find((p) => p.f.po_number === "PO-45001234");
check("a PO carries its supplier and totals", po1.f.supplier === "Bright Kids Apparel Co." && Number(po1.f.unit_count) === 168 && Number(po1.f.pending_count) === 4, JSON.stringify(po1.f));
const lines1 = await list(M.line, "dc_upc_line", { line_po_id: po1.id }, "upc,expected_qty,pallet_number,product_name");
check("the PO has its four UPC lines, all PENDING", lines1.length === 4 && lines1.every((l) => l.state === "PENDING"), JSON.stringify(lines1.map((l) => l.state)));
const pallets1 = await list(M.pallet, "dc_pallet", { pallet_po_id: po1.id }, "pallet_position,pallet_line_count");
check("the PO has its two pallets, both OPEN", pallets1.length === 2 && pallets1.every((p) => p.state === "OPEN"), JSON.stringify(pallets1.map((p) => p.state)));

section("Start QC");
check("a freshly fetched PO is still FETCHED", (await stateOf(M.po, "dc_po", po1.id)) === "FETCHED");
let r = await fire(po1.id, "complete_qc");
check("a PO cannot be completed before QC starts", r.s >= 400, `${r.s}`);
r = await fire(po1.id, "start_qc");
check("start QC moves the PO to QC_IN_PROGRESS", r.s === 200 && r.b.to_state === "QC_IN_PROGRESS", JSON.stringify(r.b)?.slice(0, 160));
await sleep(3000);
let d = await dataOf(po1.id);
check("the start time was recorded by the connector", Boolean(d.started_at), JSON.stringify(d.started_at));
check("the PO activity says QC started", String(d.qc_event_log).includes("QC_STARTED"), String(d.qc_event_log).slice(0, 120));

const byUpc = Object.fromEntries(lines1.map((l) => [l.f.upc, l]));
const [flower, bubble, varsity, cargo] = ["400414405536", "400427758582", "400428390682", "400429151992"].map((u) => byUpc[u]);

section("Verify a UPC whose count matches");
r = await fire(flower.id, "submit_count");
check("submitting without a count is refused", r.s >= 400, `${r.s}`);
await put(flower.id, { received_qty: 48 });
r = await fire(flower.id, "submit_count");
check("submitting without a photo is refused", r.s >= 400, `${r.s}`);
await put(flower.id, { photo_count: 1 });
r = await fire(flower.id, "submit_count");
check("a count and a photo are accepted", r.s === 200, JSON.stringify(r.b)?.slice(0, 160));
check("the count matcher verifies it by itself", (await waitState(M.line, "dc_upc_line", flower.id, "VERIFIED")) === "VERIFIED");
d = await dataOf(flower.id);
check("the match result is saved on the line", d.count_result === "match" && Number(d.count_diff) === 0, JSON.stringify([d.count_result, d.count_diff]));

section("Count does not match");
await put(bubble.id, { received_qty: 30, photo_count: 1 });
await fire(bubble.id, "submit_count");
check("a short count lands in COUNT_MISMATCH", (await waitState(M.line, "dc_upc_line", bubble.id, "COUNT_MISMATCH")) === "COUNT_MISMATCH");
d = await dataOf(bubble.id);
check("the matcher says short by 6", d.count_result === "short" && Number(d.count_diff) === 6, JSON.stringify([d.count_result, d.count_diff]));
r = await fire(bubble.id, "raise_exception");
check("raising an exception without a reason is refused", r.s >= 400, `${r.s}`);
await put(bubble.id, { exception_reason: "short_shipment", exception_note: "Six cartons missing" });
r = await fire(bubble.id, "raise_exception");
check("with a reason the exception is raised", r.s === 200 && r.b.to_state === "EXCEPTION", JSON.stringify(r.b)?.slice(0, 160));

section("Recount and an exception on a matching count");
await put(varsity.id, { received_qty: 55, photo_count: 1 });
await fire(varsity.id, "submit_count");
await waitState(M.line, "dc_upc_line", varsity.id, "COUNT_MISMATCH");
r = await fire(varsity.id, "recount");
check("a recount sends the line back to PENDING", r.s === 200 && r.b.to_state === "PENDING", JSON.stringify(r.b)?.slice(0, 160));
await put(varsity.id, { received_qty: 60 });
await fire(varsity.id, "submit_count");
check("the right count then verifies", (await waitState(M.line, "dc_upc_line", varsity.id, "VERIFIED")) === "VERIFIED");
await put(cargo.id, { received_qty: 24, photo_count: 1, exception_reason: "damaged", exception_note: "Water damage on two cartons" });
r = await fire(cargo.id, "raise_exception_direct");
check("damaged goods can be raised straight away, even with a matching count", r.s === 200 && r.b.to_state === "EXCEPTION", JSON.stringify(r.b)?.slice(0, 160));

section("The PO and pallets follow along");
await sleep(5000);
d = await dataOf(po1.id);
check("the PO totals add up", Number(d.pending_count) === 0 && Number(d.verified_count) === 2 && Number(d.exception_count) === 2 && Number(d.open_exception_count) === 2, JSON.stringify([d.pending_count, d.verified_count, d.exception_count, d.open_exception_count]));
check("units received are summed", Number(d.received_units) === 48 + 30 + 60 + 24, d.received_units);
const palletStates = (await list(M.pallet, "dc_pallet", { pallet_po_id: po1.id })).map((p) => p.state);
check("both pallets are CHECKED once their UPCs are settled", palletStates.every((s) => s === "CHECKED"), palletStates.join(","));

section("Complete QC with exceptions");
r = await fire(po1.id, "complete_qc");
check("a PO with open exceptions cannot complete normally", r.s >= 400, `${r.s}`);
r = await fire(po1.id, "complete_with_exceptions");
check("it completes with exceptions instead", r.s === 200 && r.b.to_state === "EXCEPTIONS_OPEN", JSON.stringify(r.b)?.slice(0, 160));
await sleep(2500);
check("the supervisor is told about the exceptions", String((await dataOf(po1.id)).qc_event_log).includes("EXCEPTIONS_OPEN"));

section("Resolve the exceptions");
r = await fire(bubble.id, "resolve_exception");
check("resolving without a note is refused", r.s >= 400, `${r.s}`);
await put(bubble.id, { resolution_note: "Supplier will send the missing cartons" });
r = await fire(bubble.id, "resolve_exception");
check("the first exception is resolved", r.s === 200 && r.b.to_state === "EXCEPTION_RESOLVED", JSON.stringify(r.b)?.slice(0, 160));
await sleep(3000);
check("one exception left, so the PO stays EXCEPTIONS_OPEN", (await stateOf(M.po, "dc_po", po1.id)) === "EXCEPTIONS_OPEN");
await put(cargo.id, { resolution_note: "Damage claim filed" });
await fire(cargo.id, "resolve_exception");
check("when the last one is resolved the PO completes by itself", (await waitState(M.po, "dc_po", po1.id, "QC_COMPLETE")) === "QC_COMPLETE");
d = await dataOf(po1.id);
check("the completion time is recorded", Boolean(d.completed_at), JSON.stringify(d.completed_at));

section("A clean PO");
const po2 = pos.find((p) => p.f.po_number === "PO-45001402");
const lines2 = await list(M.line, "dc_upc_line", { line_po_id: po2.id }, "upc,expected_qty");
await fire(po2.id, "start_qc");
r = await fire(po2.id, "complete_qc");
check("QC cannot complete while UPCs are still to check", r.s >= 400, `${r.s}`);
for (const l of lines2) {
  await put(l.id, { received_qty: Number(l.f.expected_qty), photo_count: 1 });
  await fire(l.id, "submit_count");
}
for (const l of lines2) await waitState(M.line, "dc_upc_line", l.id, "VERIFIED");
await sleep(4000);
r = await fire(po2.id, "complete_qc");
check("with every UPC verified the PO completes", r.s === 200 && r.b.to_state === "QC_COMPLETE", JSON.stringify(r.b)?.slice(0, 160));

console.log(`\nTOTAL ${total}  PASS ${total - failures}  FAIL ${failures}`);
process.exit(failures ? 1 : 0);
