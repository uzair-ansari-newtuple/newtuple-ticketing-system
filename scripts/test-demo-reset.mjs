// The demo cockpit: run a full DC QC flow, reset, check everything is back at the start, then run the whole flow again.
// The second run only passes if the connectors fire again after a reset (count matcher, roll-up, start time).
// Needs the backend (3001), the State Machine, and scripts/sm-dcqc.mjs + sm-workflow.mjs to have been run.
import { execSync } from "node:child_process";

process.loadEnvFile(".env");
const APP = "http://localhost:3001/api/mock";
let failures = 0, total = 0;
const check = (name, ok, detail = "") => { total++; if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`); };
const section = (t) => console.log(`\n== ${t} ==`);
let token = "";
const call = async (path, o = {}) => {
  const res = await fetch(APP + path, { method: o.method ?? (o.body ? "POST" : "GET"), headers: { "content-type": "application/json", ...(token && o.auth !== false ? { authorization: `Bearer ${token}` } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
  return { s: res.status, b: await res.json().catch(() => null) };
};
const flow = (extra = {}) => {
  try {
    return { ok: true, out: execSync("node scripts/test-qc-app.mjs", { env: { ...process.env, ...extra }, stdio: "pipe" }).toString() };
  } catch (err) {
    return { ok: false, out: `${err.stdout ?? ""}`.toString() };
  }
};
const failed = (out) => out.split("\n").filter((l) => l.startsWith("FAIL")).join(" | ");

section("A full DC QC flow first");
execSync("node scripts/sm-clean-qc.mjs --yes", { stdio: "pipe" });
const first = flow();
check("the first full flow passes", first.ok, failed(first.out));

section("Reset");
token = (await call("/auth/login", { auth: false, body: { email: process.env.DEMO_STORE_EMAIL, password: process.env.DEMO_STORE_PASSWORD } })).b.access_token;
check("the reset needs a signed-in user", (await call("/demo/reset", { auth: false, body: {} })).s === 401);
const before = (await call("/demo/status")).b;
check("before the reset, shipments are not all at the start", !(before.workflows[0].byState.CREATED === 4), JSON.stringify(before.workflows[0].byState));
const r = await call("/demo/reset", { body: {} });
check("the reset runs", r.s === 200, `${r.s} ${JSON.stringify(r.b)?.slice(0, 300)}`);
check("nothing could not be cleared", (r.b?.warnings ?? []).length === 0, JSON.stringify(r.b?.warnings));
check("it reports what it did", r.b.shipments.reset + r.b.shipments.recreated >= 1 && r.b.upcs.reset + r.b.upcs.recreated >= 1, JSON.stringify(r.b));

section("Everything is back at the start");
const status = (await call("/demo/status")).b;
const [ship, upc] = status.workflows;
check("all 4 shipments are Created", ship.total === 4 && ship.byState.CREATED === 4, JSON.stringify(ship));
check("all 14 UPCs are Pending", upc.total === 14 && upc.byState.PENDING === 14, JSON.stringify(upc));
const list = (await call("/qc/shipments")).b.items;
check("the app lists four ready shipments with nothing counted", list.length === 4 && list.every((s) => s.state === "CREATED" && !s.qc_ready && s.totals.received === 0), JSON.stringify(list.map((s) => [s.po_number, s.state, s.totals])));
const details = await Promise.all(list.map(async (s) => (await call(`/qc/shipments/${s.id}`)).b));
check("every UPC is Pending with no units received", details.every((d) => d.upcs.every((u) => u.state === "PENDING" && u.received_units === 0)));
const upcDetail = (await call(`/qc/upcs/${details[0].upcs[0].id}`)).b;
check("a UPC has its pallets again, none counted", upcDetail.pallets.length >= 1 && upcDetail.pallets.every((p) => p.status === "PENDING" && p.total_units === 0), JSON.stringify(upcDetail.pallets));
check("a UPC has no photos and no old notes", upcDetail.photos.length === 0 && upcDetail.comments.length === 0, `${upcDetail.photos.length} photos, ${JSON.stringify(upcDetail.comments)}`);
check("the Exceptions list is empty", (await call("/qc/exceptions")).b.items.length === 0);
const total2 = (await call("/qc/shipments/fetch", { body: {} })).b;
check("the sample data is complete, so fetching adds nothing", total2.created.length === 0);

section("Reset twice in a row");
const again = await call("/demo/reset", { body: {} });
check("a second reset works with nothing to clear", again.s === 200 && again.b.warnings.length === 0, `${again.s} ${JSON.stringify(again.b)?.slice(0, 200)}`);

section("The whole flow again after a reset");
const second = flow({ KEEP_DATA: "1" });
check("the second full flow passes (connectors fire again)", second.ok, failed(second.out));

console.log(`\nTOTAL ${total}  PASS ${total - failures}  FAIL ${failures}`);
process.exit(failures ? 1 : 0);
