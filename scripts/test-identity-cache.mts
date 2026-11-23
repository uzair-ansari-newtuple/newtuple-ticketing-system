// Checks that finding out who a user is does not repeat itself. No network: fetch is replaced and slowed down so requests really overlap.
import assert from "node:assert/strict";

process.env.SM_BASE_URL = "https://sm.test/api";
process.env.SM_EMAIL = "service@test";
process.env.SM_PASSWORD = "x";

const { userFromToken, signIn, forgetToken } = await import("../src/lib/sm/identity");

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let calls: string[] = [];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = new URL(String(input)).pathname.replace("/api", "");
  const body = String(init?.body ?? "");
  calls.push(path);
  await sleep(40); // a State Machine answer takes time
  if (path === "/auth/login") return json(200, { access_token: body.includes("service@test") ? "service-token" : "user-token-from-sign-in", refresh_token: "r" });
  if (path === "/auth/me") return json(200, { id: "u1", email: "boss@test", full_name: "Boss" });
  if (path === "/roles/my-permissions") return json(200, { roles: [{ name: "superadmin" }] });
  if (path.startsWith("/entity-records")) return json(200, { items: [{ data: { user_email: "boss@test", store_id: "ST-1", store_name: "One" } }] });
  return json(404, {});
}) as typeof fetch;

const count = (path: string) => calls.filter((c) => c === path).length;

// 1. Four requests arrive together with a token nothing is remembered about: one lookup, shared.
const together = await Promise.all([userFromToken("tok-a"), userFromToken("tok-a"), userFromToken("tok-a"), userFromToken("tok-a")]);
assert.ok(together.every((u) => u?.store_id === "ST-1"), "all four get the same answer");
assert.equal(count("/auth/me"), 1, "one /auth/me for four simultaneous requests");
assert.equal(count("/roles/my-permissions"), 1);
assert.equal(count("/entity-records"), 1, "one store lookup");

// 2. Different tokens do not share.
calls = [];
await Promise.all([userFromToken("tok-b"), userFromToken("tok-c")]);
assert.equal(count("/auth/me"), 2, "each token is looked up on its own");

// 3. Signing in remembers the user, so the first request after it asks nothing.
calls = [];
const result = await signIn("boss@test", "pw");
assert.ok(result.ok);
calls = [];
const first = await userFromToken("user-token-from-sign-in");
assert.equal(first?.store_id, "ST-1");
assert.equal(calls.length, 0, "the first request after sign-in does not look the user up again");

// 4. Signing out while a lookup is running: the finished lookup must not bring the user back.
calls = [];
const running = userFromToken("tok-d");
await sleep(10);
forgetToken("tok-d");
await running;
const after = calls.length;
await userFromToken("tok-d");
assert.ok(calls.length > after, "after sign-out the token is looked up again, not answered from memory");

// 5. A later lookup under the same token is not removed by an older one finishing.
calls = [];
const older = userFromToken("tok-e");
await sleep(10);
forgetToken("tok-e");
const newer = userFromToken("tok-e"); // starts a new lookup
await older;
const shared = userFromToken("tok-e"); // must join the newer lookup, not start a third
await Promise.all([newer, shared]);
assert.equal(count("/auth/me"), 2, "exactly two lookups: the one signed out and the new one");

console.log("Identity cache passed.");
