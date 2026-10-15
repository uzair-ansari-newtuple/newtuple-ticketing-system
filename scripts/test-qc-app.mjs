// DC QC through the routes the screens call, checked against the State Machine: fetch shipments, start QC, check pallets,
// approve or flag UPCs, supervisor answers, complete QC and receipt.
// Needs the backend (3001), the State Machine, and scripts/sm-dcqc.mjs to have been run.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

process.loadEnvFile(".env");
const APP = "http://localhost:3001/api/mock";
let failures = 0, total = 0;
const check = (name, ok, detail = "") => { total++; if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`); };
const section = (t) => console.log(`\n== ${t} ==`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let token = "";
const call = async (path, o = {}) => {
  const res = await fetch(APP + path, { method: o.method ?? (o.body ? "POST" : "GET"), headers: { "content-type": "application/json", ...(token && o.auth !== false ? { authorization: `Bearer ${token}` } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
  return { s: res.status, b: await res.json().catch(() => null) };
};
const photo = `data:image/jpeg;base64,${readFileSync("public/catalog/400414405536.jpg").toString("base64")}`;
const ALL_CHECKS = Object.fromEntries(["inspect_case_opened", "inspect_style_confirmed", "inspect_color_confirmed", "inspect_upc_confirmed", "inspect_price_confirmed", "label_pallet_confirmed", "label_cases_confirmed"].map((k) => [k, true]));
const until = async (get, ok, ms = 20000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await get(); if (ok(v)) return v; await sleep(700); } return v; };

execSync("node scripts/sm-clean-qc.mjs --yes", { stdio: "pipe" });
const startedAt = new Date(Date.now() - 2000).toISOString();
token = (await call("/auth/login", { auth: false, body: { email: process.env.DEMO_STORE_EMAIL, password: process.env.DEMO_STORE_PASSWORD } })).b.access_token;

/** Counts a pallet exactly as the PO expects: full cases of 12 plus the loose units. */
const countPallet = (upcId, p, units = p.expected_units) => call(`/qc/upcs/${upcId}/pallets/${p.id}`, { body: { checks: ALL_CHECKS, mdl_actual: 12, full_cases_count: Math.floor(units / 12), partial_units: units % 12 } });

section("Signing in and fetching shipments");
check("the QC list needs a signed-in user", (await call("/qc/shipments", { auth: false })).s === 401);
check("an empty State Machine gives an empty list", (await call("/qc/shipments")).b.items.length === 0);
const fetched = await call("/qc/shipments/fetch", { body: {} });
check("fetching brings in four shipments", fetched.s === 200 && fetched.b.items.length === 4, JSON.stringify(fetched.b)?.slice(0, 120));
check("fetching again adds none", (await call("/qc/shipments/fetch", { body: {} })).b.created.length === 0);
const s1 = fetched.b.items.find((s) => s.po_number === "PO-45001234");
check("a shipment shows its vendor, DC and totals", s1.vendor_name === "Bright Kids Apparel Co." && s1.dc_id === "DC-ATL-01" && s1.totals.upcs === 4 && s1.totals.units === 168 && s1.state === "CREATED" && !s1.qc_ready, JSON.stringify(s1));
let ship = (await call(`/qc/shipments/${s1.id}`)).b;
check("the shipment lists its four UPCs, all PENDING", ship.upcs.length === 4 && ship.upcs.every((u) => u.state === "PENDING"));
const [flower, bubble, varsity, cargo] = ["400414405536", "400427758582", "400428390682", "400429151992"].map((c) => ship.upcs.find((u) => u.upc_code === c));

section("Start QC");
let r = await call(`/qc/upcs/${flower.id}`);
check("a UPC shows its pallets, none counted yet", r.s === 200 && r.b.pallets.length === 1 && r.b.pallets[0].status === "PENDING" && r.b.pallets[0].expected_units === 48, JSON.stringify(r.b.pallets));
r = await countPallet(flower.id, r.b.pallets[0]);
check("a UPC cannot be worked on before QC starts", r.s === 409, `${r.s} ${JSON.stringify(r.b)}`);
check("starting with no shipment chosen is refused", (await call("/qc/shipments/start", { body: { shipment_ids: [] } })).s === 422);
r = await call("/qc/shipments/start", { body: { shipment_ids: [s1.id] } });
check("starting QC moves the shipment to IN_PROGRESS", r.s === 200 && r.b.items.find((s) => s.id === s1.id).state === "IN_PROGRESS");
const live = await until(async () => (await call(`/qc/shipments/${s1.id}`)).b, (s) => Boolean(s.started_at));
check("the start time is recorded by the connector", Boolean(live.started_at), JSON.stringify(live.started_at));

section("Check a UPC and approve it");
let u = (await call(`/qc/upcs/${flower.id}`)).b;
r = await call(`/qc/upcs/${flower.id}/pallets/${u.pallets[0].id}`, { body: { mdl_actual: -1 } });
check("a bad count is refused", r.s === 422, `${r.s}`);
r = await call(`/qc/upcs/${flower.id}/approve`, { body: {} });
check("approving before any check is refused", r.s === 409, `${r.s} ${JSON.stringify(r.b)}`);
r = await call(`/qc/upcs/${flower.id}/pallets/${u.pallets[0].id}`, { body: { checks: { inspect_case_opened: true }, mdl_actual: 12, full_cases_count: 3 } });
check("a first partial check moves the UPC to IN_PROGRESS", r.s === 200 && r.b.state === "IN_PROGRESS" && r.b.pallets[0].status === "IN_PROGRESS" && r.b.pallets[0].total_units === 36, JSON.stringify(r.b)?.slice(0, 200));
r = await countPallet(flower.id, u.pallets[0]);
check("a full check and count completes the pallet", r.s === 200 && r.b.pallets[0].status === "COMPLETE" && r.b.received_units === 48 && r.b.labels_complete, JSON.stringify(r.b.pallets));
check("the count matcher says it matches", r.b.count.result === "MATCH");
r = await call(`/qc/upcs/${flower.id}/approve`, { body: {} });
check("approving without a photo is refused", r.s === 409 && /photo/.test(r.b.detail), JSON.stringify(r.b));
r = await call(`/qc/upcs/${flower.id}/photo`, { body: { photo } });
check("a photo is saved with the UPC", r.s === 200 && r.b.photos.length === 1 && r.b.photo_count === 1, `${r.s}`);
r = await call(`/qc/upcs/${flower.id}/approve`, { body: {} });
check("the UPC is approved", r.s === 200 && r.b.state === "APPROVED", JSON.stringify(r.b)?.slice(0, 160));

section("A count that does not match");
u = (await call(`/qc/upcs/${bubble.id}`)).b;
await call(`/qc/upcs/${bubble.id}/photo`, { body: { photo } });
r = await countPallet(bubble.id, u.pallets[0], 30);
check("a short count is shown as short by 6", r.s === 200 && r.b.count.result === "SHORT" && r.b.count.diff === 6, JSON.stringify(r.b.count));
r = await call(`/qc/upcs/${bubble.id}/approve`, { body: {} });
check("a UPC with a short count cannot be approved", r.s === 409 && /short by 6/.test(r.b.detail), JSON.stringify(r.b));
r = await call(`/qc/upcs/${bubble.id}/flag`, { body: { reason: "nonsense" } });
check("an unknown flag reason is refused", r.s === 422, `${r.s}`);
r = await call(`/qc/upcs/${bubble.id}/flag`, { body: { reason: "SHORT_SHIPMENT", note: "Six units missing" } });
check("flagging puts the UPC on SUPERVISOR_HOLD", r.s === 200 && r.b.state === "SUPERVISOR_HOLD" && r.b.flag.reason === "SHORT_SHIPMENT" && r.b.flag.status === "OPEN", JSON.stringify(r.b)?.slice(0, 200));

section("Other UPCs and the blocking count");
u = (await call(`/qc/upcs/${varsity.id}`)).b;
await call(`/qc/upcs/${varsity.id}/photo`, { body: { photo } });
for (const p of u.pallets) await countPallet(varsity.id, p);
r = await call(`/qc/upcs/${varsity.id}/approve`, { body: {} });
check("a two-pallet UPC is approved once both are counted", r.s === 200 && r.b.state === "APPROVED" && r.b.received_units === 60, JSON.stringify(r.b)?.slice(0, 160));
r = await call(`/qc/upcs/${cargo.id}/flag`, { body: { reason: "DAMAGED", note: "Crushed cartons" } });
check("a UPC can be flagged without counting it", r.s === 200 && r.b.state === "SUPERVISOR_HOLD", JSON.stringify(r.b)?.slice(0, 120));
ship = await until(async () => (await call(`/qc/shipments/${s1.id}`)).b, (s) => s.totals.on_hold === 2);
check("the shipment counts 2 approved and 2 on hold", ship.totals.approved === 2 && ship.totals.on_hold === 2 && ship.totals.blocking === 2, JSON.stringify(ship.totals));
r = await call(`/qc/shipments/${s1.id}/complete`, { body: {} });
check("QC cannot be submitted while UPCs are blocking", r.s === 409 && /not approved/.test(r.b.detail), JSON.stringify(r.b));
check("the flagged UPCs are listed for the supervisor", (await call("/qc/exceptions")).b.items.filter((x) => x.state === "SUPERVISOR_HOLD").length === 2);

section("The supervisor answers");
r = await call(`/qc/upcs/${bubble.id}/resolve`, { body: { action: "nonsense" } });
check("an unknown answer is refused", r.s === 422, `${r.s}`);
r = await call(`/qc/upcs/${bubble.id}/resolve`, { body: { action: "approve", note: "Supplier will ship the rest" } });
check("a supervisor can approve a held UPC", r.s === 200 && r.b.state === "APPROVED" && r.b.flag.status === "RESOLVED", JSON.stringify(r.b)?.slice(0, 160));
r = await call(`/qc/upcs/${bubble.id}/resolve`, { body: { action: "approve" } });
check("a UPC that is not on hold cannot be answered", r.s === 409, `${r.s}`);
r = await call(`/qc/upcs/${cargo.id}/resolve`, { body: { action: "wont_qc", note: "Damage claim filed" } });
check("a supervisor can skip a UPC (won't QC)", r.s === 200 && r.b.state === "WONT_QC" && r.b.flag.status === "RESOLVED_WONT_QC", JSON.stringify(r.b)?.slice(0, 160));
ship = await until(async () => (await call(`/qc/shipments/${s1.id}`)).b, (s) => s.qc_ready);
check("with nothing blocking, the shipment is QC ready", ship.qc_ready && ship.totals.blocking === 0 && ship.totals.approved === 3 && ship.totals.wont_qc === 1, JSON.stringify([ship.qc_ready, ship.totals]));

section("Reopen and return");
r = await call(`/qc/upcs/${flower.id}/reopen`, { body: { reason: "" } });
check("reopening needs a reason", r.s === 422, `${r.s}`);
r = await call(`/qc/upcs/${flower.id}/reopen`, { body: { reason: "Recount the second case" } });
check("a supervisor can reopen an approved UPC", r.s === 200 && r.b.state === "IN_PROGRESS" && r.b.rework_reason === "Recount the second case", JSON.stringify(r.b)?.slice(0, 160));
r = await call(`/qc/shipments/${s1.id}/complete`, { body: {} });
check("a reopened UPC blocks QC again", r.s === 409, `${r.s}`);
await call(`/qc/upcs/${flower.id}/approve`, { body: {} });
await until(async () => (await call(`/qc/shipments/${s1.id}`)).b, (s) => s.qc_ready);

section("Complete QC and receipt");
r = await call(`/qc/shipments/${s1.id}/complete`, { body: {} });
check("QC is submitted and the shipment becomes QC_COMPLETE", r.s === 200 && r.b.state === "QC_COMPLETE", JSON.stringify(r.b)?.slice(0, 160));
ship = await until(async () => (await call(`/qc/shipments/${s1.id}`)).b, (s) => Boolean(s.completed_at));
check("the completion time is recorded", Boolean(ship.completed_at));
r = await call(`/qc/shipments/${s1.id}/receipt`, { body: { action: "close", confirmation_number: "X" } });
check("a receipt cannot be closed before it starts", r.s === 409, `${r.s}`);
r = await call(`/qc/shipments/${s1.id}/receipt`, { body: { action: "start" } });
check("the supervisor starts the receipt", r.s === 200 && r.b.state === "RECEIPT_IN_PROGRESS", JSON.stringify(r.b)?.slice(0, 120));
r = await call(`/qc/shipments/${s1.id}/receipt`, { body: { action: "close", confirmation_number: "" } });
check("closing the receipt needs a confirmation number", r.s === 422, `${r.s}`);
r = await call(`/qc/shipments/${s1.id}/receipt`, { body: { action: "return", note: "Recheck pallet 2" } });
check("the receipt can be returned to the associate", r.s === 200 && r.b.state === "IN_PROGRESS", JSON.stringify(r.b)?.slice(0, 120));
await call(`/qc/shipments/${s1.id}/complete`, { body: {} });
await call(`/qc/shipments/${s1.id}/receipt`, { body: { action: "start" } });
r = await call(`/qc/shipments/${s1.id}/receipt`, { body: { action: "close", confirmation_number: "RCPT-88231" } });
check("the receipt is closed with a confirmation number", r.s === 200 && r.b.state === "CLOSED" && r.b.confirmation_number === "RCPT-88231", JSON.stringify(r.b)?.slice(0, 160));

section("A clean shipment");
const s4 = (await call("/qc/shipments")).b.items.find((s) => s.po_number === "PO-45001402");
await call("/qc/shipments/start", { body: { shipment_ids: [s4.id] } });
for (const up of (await call(`/qc/shipments/${s4.id}`)).b.upcs) {
  const d = (await call(`/qc/upcs/${up.id}`)).b;
  await call(`/qc/upcs/${up.id}/photo`, { body: { photo } });
  for (const p of d.pallets) await countPallet(up.id, p);
  await call(`/qc/upcs/${up.id}/approve`, { body: {} });
}
await until(async () => (await call(`/qc/shipments/${s4.id}`)).b, (s) => s.qc_ready);
r = await call(`/qc/shipments/${s4.id}/complete`, { body: {} });
check("with every UPC approved the shipment completes", r.s === 200 && r.b.state === "QC_COMPLETE", JSON.stringify(r.b)?.slice(0, 120));

section("Connectors");
const KEY = { "x-api-key": process.env.SM_CONNECTOR_KEY };
const direct = (path, body, headers = KEY) => fetch(`http://localhost:3001/api/sm/dcqc/${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => null) }));
check("every connector endpoint refuses a call without the key", (await Promise.all(["fetch-shipments", "rollup", "count-match", "notify"].map((p) => direct(p, { record_id: s1.id }, {})))).every((x) => x.s === 401));
check("a connector call about an unknown record is refused", (await direct("count-match", { record_id: "not-an-id" })).s === 422);
check("the notify connector refuses an unknown event", (await direct("notify", { record_id: s1.id, event: "NOPE" })).s === 422);
check("the fetch connector is safe to call again", (await direct("fetch-shipments", {})).b.created.length === 0);

let notes = [];
for (let i = 0; i < 20; i++) { notes = (await call("/qc/notifications")).b.items; if (["QC_STARTED", "UPC_FLAGGED", "QC_COMPLETE", "RECEIPT_CLOSED"].every((e) => notes.some((n) => n.event === e))) break; await sleep(500); }
for (const [event, to] of [["QC_STARTED", "supervisor"], ["UPC_FLAGGED", "supervisor"], ["QC_COMPLETE", "supervisor"], ["RECEIPT_CLOSED", "associate"]]) {
  const n = notes.find((x) => x.event === event);
  check(`a ${event} message went to the ${to}`, n?.recipient === to && n.message.includes("PO-"), JSON.stringify(n));
}
check("the flagged-UPC message names the item", notes.some((n) => n.event === "UPC_FLAGGED" && /Bubble Charmed|Frayed Cargo/.test(n.message)), JSON.stringify(notes.map((n) => n.message)));

const runs = execSync(`docker exec state-machine-modular-modular-db-1 psql -U statemachine -d statemachine -At -F'|' -c "select split_part(idempotency_key,':',2), status from modular_backend.action_runs where created_at > '${startedAt}'"`).toString().trim().split("\n").filter(Boolean).map((l) => l.split("|"));
const ranOn = (state) => runs.some(([st, status]) => st === state && status === "succeeded");
check("no connector call failed during the whole flow", !runs.some(([, status]) => status === "failed"), JSON.stringify(runs.filter(([, st]) => st === "failed")));
for (const state of ["IN_PROGRESS", "SUPERVISOR_HOLD", "APPROVED", "WONT_QC", "QC_COMPLETE", "CLOSED"]) check(`the connectors on ${state} ran`, ranOn(state));
check("the count matcher connector ran for the pallet saves", runs.filter(([st, status]) => st === "IN_PROGRESS" && status === "succeeded").length >= 8, `${runs.filter(([st]) => st === "IN_PROGRESS").length} runs`);

console.log(`\nTOTAL ${total}  PASS ${total - failures}  FAIL ${failures}`);
process.exit(failures ? 1 : 0);
