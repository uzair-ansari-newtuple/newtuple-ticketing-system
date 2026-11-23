// Checks that the app finds the right workflow in whichever State Machine it is connected to, and cleans up after a failed fetch. No network: fetch is replaced.
import assert from "node:assert/strict";

process.env.SM_BASE_URL = "https://sm.test/api";
process.env.SM_EMAIL = "service@test";
process.env.SM_PASSWORD = "x";
// Saved names from some other State Machine: they are not published here.
process.env.SM_MACHINE_NAME = "workflow_old_incident";
process.env.SM_DCQC_SHIPMENT_MACHINE_NAME = "workflow_old_shipment";
process.env.SM_DCQC_UPC_MACHINE_NAME = "workflow_old_upc";
process.env.SM_CATALOG_MACHINE_NAME = "workflow_old_catalog";

const { machineFor, forgetMachines } = await import("../src/lib/sm/machines");
const { enroll, listTickets } = await import("../src/lib/sm/records");
const { fetchShipments } = await import("../src/lib/qc/sm");
const { SmError } = await import("../src/lib/sm/client");

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let published = [
  { entity_type: "incident", machine_name: "workflow_new_incident" },
  { entity_type: "incident", machine_name: "workflow_new_incident" }, // the State Machine lists a workflow once per version
  { entity_type: "shipment", machine_name: "workflow_new_shipment" },
  { entity_type: "upc", machine_name: "workflow_new_upc" },
  { entity_type: "catalog_product", machine_name: "workflow_new_catalog" },
  { entity_type: "supplier", machine_name: "workflow_a" },
  { entity_type: "supplier", machine_name: "workflow_b" },
];
let listFails = false;
let enrollStatus = 200;
const calls: { method: string; path: string }[] = [];
let nextId = 0;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const path = url.pathname.replace("/api", "") + url.search;
  const method = init?.method ?? "GET";
  calls.push({ method, path });
  if (path.endsWith("/auth/login")) return json(200, { access_token: "t", refresh_token: "r" });
  if (path === "/workflow-state-machines") return listFails ? json(500, { detail: "down" }) : json(200, { published_items: published });
  if (path.startsWith("/workflow-enrollments")) return json(200, { items: [], total_count: 0 });
  if (method === "GET" && path.startsWith("/entity-records")) return json(200, { items: [] });
  if (path.startsWith("/entity-types/")) return json(200, { entity_type_id: `type-${path.split("/").pop()}` });
  if (method === "POST" && path === "/entity-records") return json(200, { entity_id: `rec-${++nextId}`, data: {}, created_at: "", updated_at: "" });
  if (method === "PUT" && path.startsWith("/entity-records/")) return json(200, { entity_id: path.split("/").pop(), data: {}, created_at: "", updated_at: "" });
  if (method === "DELETE" && path.startsWith("/entity-records/")) return json(204, null);
  if (path.includes("/enrollments") && method === "POST") return enrollStatus === 200 ? json(200, {}) : json(enrollStatus, { detail: "workflow not found" });
  return json(404, { detail: `unmocked ${method} ${path}` });
}) as typeof fetch;

const listCalls = () => calls.filter((c) => c.path === "/workflow-state-machines").length;

// 1. A saved name from another State Machine is replaced by the workflow that really runs the type.
assert.equal(await machineFor("shipment", "workflow_old_shipment"), "workflow_new_shipment");
assert.equal(await machineFor("upc", "workflow_old_upc"), "workflow_new_upc");
assert.equal(await machineFor("incident", "workflow_old_incident"), "workflow_new_incident");
assert.equal(await machineFor("catalog_product", "workflow_old_catalog"), "workflow_new_catalog");

// 2. With no saved name it still works.
assert.equal(await machineFor("shipment"), "workflow_new_shipment");

// 3. A saved name that is right is kept, even when the type has several workflows.
assert.equal(await machineFor("supplier", "workflow_b"), "workflow_b");
assert.equal(await machineFor("supplier"), "workflow_a");

// 4. The list is read once and reused.
assert.equal(listCalls(), 1, "the published list is cached");

// 5. A type with no workflow is an error that says so, not an empty answer. It looks once more before giving up.
const before = listCalls();
await assert.rejects(() => machineFor("nothing_here"), (e: unknown) => e instanceof SmError && e.status === 404 && /nothing_here/.test(e.message));
assert.equal(listCalls(), before + 1, "looks again once for a workflow published a moment ago");

// 6. A workflow published after the list was read is found on the second look.
published = [...published, { entity_type: "late", machine_name: "workflow_late" }];
assert.equal(await machineFor("late"), "workflow_late");

// 7. When the list cannot be read, the saved name is used instead of failing.
forgetMachines();
listFails = true;
assert.equal(await machineFor("shipment", "workflow_old_shipment"), "workflow_old_shipment");
await assert.rejects(() => machineFor("shipment"));
listFails = false;
forgetMachines();

// 8. Listing and enrolling use the resolved workflow, not the saved one.
calls.length = 0;
await listTickets({ fields: ["po_number"], machine: "workflow_old_shipment", entityType: "shipment" });
assert.match(calls.find((c) => c.path.startsWith("/workflow-enrollments"))!.path, /machine_name=workflow_new_shipment/);
calls.length = 0;
await enroll("abc", "upc", "workflow_old_upc");
assert.ok(calls.some((c) => c.method === "POST" && c.path === "/workflow-state-machines/workflow_new_upc/enrollments"), "enrolls in the real workflow");
calls.length = 0;
await enroll("def");
assert.ok(calls.some((c) => c.path === "/workflow-state-machines/workflow_new_incident/enrollments"), "an incident is enrolled in the incident workflow");

// 9. A failed fetch removes what it created instead of leaving records no workflow owns.
calls.length = 0;
enrollStatus = 404;
await assert.rejects(() => fetchShipments(), (e: unknown) => e instanceof SmError && e.status === 404);
const created = calls.filter((c) => c.method === "POST" && c.path === "/entity-records").length;
const deleted = calls.filter((c) => c.method === "DELETE").length;
assert.ok(created >= 1 && deleted === created, `every record made before the failure is removed (made ${created}, removed ${deleted})`);

// 10. A fetch that works enrolls in the real workflows and removes nothing.
calls.length = 0;
enrollStatus = 200;
const result = await fetchShipments();
assert.ok(result.created.length > 0);
assert.equal(calls.filter((c) => c.method === "DELETE").length, 0);
const enrolledIn = new Set(calls.filter((c) => c.path.endsWith("/enrollments")).map((c) => c.path.split("/")[2]));
assert.deepEqual([...enrolledIn].sort(), ["workflow_new_shipment", "workflow_new_upc"]);

console.log("Workflow resolution passed.");
