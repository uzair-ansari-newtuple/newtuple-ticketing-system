// The DC QC screens' backend: every call a signed-in user makes, checked against the State Machine.
// Needs the backend (3001), the State Machine, and scripts/sm-qc.mjs to have been run.
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
const pollPo = async (id, want, ms = 20000) => {
  const until = Date.now() + ms; let po;
  while (Date.now() < until) { po = (await call(`/qc/pos/${id}`)).b; if (po.state === want) return po; await sleep(800); }
  return po;
};

execSync("node scripts/sm-clean-qc.mjs --yes", { stdio: "pipe" });
token = (await call("/auth/login", { auth: false, body: { email: process.env.DEMO_STORE_EMAIL, password: process.env.DEMO_STORE_PASSWORD } })).b.access_token;

section("Signing in");
check("the QC list needs a signed-in user", (await call("/qc/pos", { auth: false })).s === 401);
check("an empty State Machine gives an empty list", (await call("/qc/pos")).b.items.length === 0);

section("Fetch POs");
const fetched = await call("/qc/pos/fetch", { body: {} });
check("fetching brings in four POs", fetched.s === 200 && fetched.b.items.length === 4, JSON.stringify(fetched.b)?.slice(0, 120));
check("fetching again adds none", (await call("/qc/pos/fetch", { body: {} })).b.created.length === 0);
const po1 = fetched.b.items.find((p) => p.number === "PO-45001234");
check("a PO shows its supplier, shipment and totals", po1.supplier && po1.shipment.carrier === "XPO Logistics" && po1.totals.lines === 4 && po1.totals.units === 168 && po1.state === "FETCHED", JSON.stringify(po1));
let detail = (await call(`/qc/pos/${po1.id}`)).b;
check("the PO detail lists its pallets and UPC lines", detail.pallets.length === 2 && detail.lines.length === 4 && detail.lines.every((l) => l.state === "PENDING"));

section("Start QC");
const [a, b, c, d] = detail.lines;
let r = await call(`/qc/lines/${a.id}/count`, { body: { received_qty: a.expected_qty, photo } });
check("a UPC cannot be counted before QC starts", r.s === 409, `${r.s} ${JSON.stringify(r.b)}`);
check("starting with no PO chosen is refused", (await call("/qc/pos/start", { body: { po_ids: [] } })).s === 422);
r = await call("/qc/pos/start", { body: { po_ids: [po1.id] } });
check("starting QC moves the PO to QC_IN_PROGRESS", r.s === 200 && r.b.items.find((p) => p.id === po1.id).state === "QC_IN_PROGRESS", JSON.stringify(r.b)?.slice(0, 120));

section("Verify, mismatch and exceptions");
r = await call(`/qc/lines/${a.id}/count`, { body: { received_qty: -3, photo } });
check("a bad count is refused", r.s === 422, `${r.s}`);
r = await call(`/qc/lines/${a.id}/count`, { body: { received_qty: a.expected_qty } });
check("a count without a photo is refused", r.s === 422, `${r.s}`);
r = await call(`/qc/lines/${a.id}/count`, { body: { received_qty: a.expected_qty, photo } });
check("a matching count is verified by the State Machine", r.s === 200 && r.b.state === "VERIFIED" && r.b.count_result === "match", JSON.stringify(r.b)?.slice(0, 160));
check("the photo is stored with the UPC", r.b.photos.length === 1 && r.b.photos[0].startsWith("data:image/jpeg"), r.b.photos?.length);
r = await call(`/qc/lines/${a.id}/count`, { body: { received_qty: a.expected_qty, photo } });
check("a UPC that is already verified cannot be counted again", r.s === 409, `${r.s}`);
r = await call(`/qc/lines/${b.id}/count`, { body: { received_qty: b.expected_qty - 5, photo } });
check("a short count is sent to COUNT_MISMATCH", r.s === 200 && r.b.state === "COUNT_MISMATCH" && r.b.count_result === "short" && r.b.count_diff === 5, JSON.stringify(r.b)?.slice(0, 160));
r = await call(`/qc/lines/${b.id}/recount`, { body: {} });
check("a recount puts it back to PENDING", r.s === 200 && r.b.state === "PENDING", JSON.stringify(r.b)?.slice(0, 120));
r = await call(`/qc/lines/${b.id}/count`, { body: { received_qty: b.expected_qty - 5, photo } });
r = await call(`/qc/lines/${b.id}/exception`, { body: { reason: "nonsense", note: "" } });
check("an unknown exception reason is refused", r.s === 422, `${r.s}`);
r = await call(`/qc/lines/${b.id}/exception`, { body: { reason: "SHORT_SHIPMENT", note: "Five units missing" } });
check("an exception is raised on a mismatch", r.s === 200 && r.b.state === "EXCEPTION" && r.b.exception.reason === "SHORT_SHIPMENT", JSON.stringify(r.b)?.slice(0, 160));
r = await call(`/qc/lines/${c.id}/exception`, { body: { reason: "DAMAGED", note: "Crushed cartons", received_qty: c.expected_qty, photo } });
check("damaged goods can be raised directly, with the count", r.s === 200 && r.b.state === "EXCEPTION" && r.b.received_qty === c.expected_qty && r.b.photos.length === 1, JSON.stringify(r.b)?.slice(0, 160));
r = await call(`/qc/lines/${d.id}/exception`, { body: { reason: "DAMAGED" } });
check("a direct exception needs a count", r.s === 422, `${r.s}`);

section("Complete QC");
r = await call(`/qc/pos/${po1.id}/complete`, { body: {} });
check("QC cannot be completed while a UPC is unchecked", r.s === 409 && /still to check/.test(r.b.detail), JSON.stringify(r.b));
await call(`/qc/lines/${d.id}/count`, { body: { received_qty: d.expected_qty, photo } });
await sleep(4000);
detail = (await call(`/qc/pos/${po1.id}`)).b;
check("the totals follow along: 2 verified, 2 open exceptions", detail.totals.verified === 2 && detail.totals.open_exceptions === 2 && detail.totals.pending === 0, JSON.stringify(detail.totals));
check("pallets are marked checked", detail.pallets.every((p) => p.state === "CHECKED"), JSON.stringify(detail.pallets.map((p) => p.state)));
r = await call(`/qc/pos/${po1.id}/complete`, { body: { note: "Two exceptions to follow up" } });
check("with open exceptions the PO goes to EXCEPTIONS_OPEN", r.s === 200 && r.b.state === "EXCEPTIONS_OPEN", JSON.stringify(r.b)?.slice(0, 120));
let told = false;
for (let i = 0; i < 20 && !told; i++) { told = (await call(`/qc/pos/${po1.id}`)).b.activity.some((e) => e.type === "EXCEPTIONS_OPEN"); if (!told) await sleep(500); }
check("the supervisor is told about the exceptions", told);

section("Exceptions");
let ex = (await call("/qc/exceptions")).b.items;
check("both open exceptions are listed", ex.filter((l) => l.state === "EXCEPTION").length === 2, JSON.stringify(ex.map((l) => l.state)));
r = await call(`/qc/lines/${b.id}/resolve`, { body: { note: "" } });
check("resolving without a note is refused", r.s === 422, `${r.s}`);
r = await call(`/qc/lines/${b.id}/resolve`, { body: { note: "Supplier will ship the missing units" } });
check("an exception is resolved with a note", r.s === 200 && r.b.state === "EXCEPTION_RESOLVED" && r.b.exception.resolution.note.startsWith("Supplier"), JSON.stringify(r.b)?.slice(0, 160));
r = await call(`/qc/lines/${b.id}/resolve`, { body: { note: "again" } });
check("an exception cannot be resolved twice", r.s === 409, `${r.s}`);
check("the PO stays open while one exception remains", (await pollPo(po1.id, "EXCEPTIONS_OPEN", 3000)).state === "EXCEPTIONS_OPEN");
await call(`/qc/lines/${c.id}/resolve`, { body: { note: "Damage claim filed" } });
const done = await pollPo(po1.id, "QC_COMPLETE");
check("resolving the last exception completes the PO", done.state === "QC_COMPLETE" && Boolean(done.completed_at), `${done.state}`);
r = await call(`/qc/lines/${a.id}/count`, { body: { received_qty: 1, photo } });
check("a finished PO takes no more counts", r.s === 409, `${r.s}`);

section("A clean PO");
const po2 = (await call("/qc/pos")).b.items.find((p) => p.number === "PO-45001402");
await call("/qc/pos/start", { body: { po_ids: [po2.id] } });
for (const l of (await call(`/qc/pos/${po2.id}`)).b.lines) await call(`/qc/lines/${l.id}/count`, { body: { received_qty: l.expected_qty, photo } });
await sleep(4000);
r = await call(`/qc/pos/${po2.id}/complete`, { body: {} });
check("with every UPC verified the PO completes cleanly", r.s === 200 && r.b.state === "QC_COMPLETE", JSON.stringify(r.b)?.slice(0, 120));

console.log(`\nTOTAL ${total}  PASS ${total - failures}  FAIL ${failures}`);
process.exit(failures ? 1 : 0);
