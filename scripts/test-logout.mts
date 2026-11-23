// Checks the server side of signing out: the remembered user is dropped and the State Machine session is ended. No network: fetch is replaced.
import assert from "node:assert/strict";

process.env.SM_BASE_URL = "https://sm.test/api";
process.env.SM_EMAIL = "service@test";
process.env.SM_PASSWORD = "x";

const { userFromToken, forgetToken, endSession } = await import("../src/lib/sm/identity");

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let calls: { method: string; path: string; body: string }[] = [];
let logoutStatus = 200;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = new URL(String(input)).pathname.replace("/api", "");
  calls.push({ method: init?.method ?? "GET", path, body: String(init?.body ?? "") });
  if (path === "/auth/login") return json(200, { access_token: "service-token", refresh_token: "r" });
  if (path === "/auth/me") return json(200, { id: "u1", email: "boss@test", full_name: "Boss" });
  if (path === "/roles/my-permissions") return json(200, { roles: [{ name: "superadmin" }] });
  if (path.startsWith("/entity-records")) return json(200, { items: [{ data: { user_email: "boss@test", store_id: "ST-1", store_name: "One" } }] });
  if (path === "/auth/logout") return logoutStatus === 200 ? json(200, {}) : json(logoutStatus, {});
  return json(404, {});
}) as typeof fetch;

const asked = () => calls.filter((c) => c.path === "/auth/me").length;

// A user is remembered between calls...
await userFromToken("tok-1");
await userFromToken("tok-1");
assert.equal(asked(), 1, "the second call is answered from memory");

// ...until the token is signed out. Then it is looked up again, so memory never outlives the sign-out.
forgetToken("tok-1");
await userFromToken("tok-1");
assert.equal(asked(), 2, "after sign-out the token is not answered from memory");

// Forgetting one token leaves the others alone.
await userFromToken("tok-2");
forgetToken("tok-1");
const before = asked();
await userFromToken("tok-2");
assert.equal(asked(), before, "another user's memory is untouched");
forgetToken("");

// The State Machine session is ended with the refresh token.
calls = [];
assert.equal(await endSession("refresh-abc"), true);
const logout = calls.find((c) => c.path === "/auth/logout");
assert.ok(logout && logout.method === "POST" && JSON.parse(logout.body).refresh_token === "refresh-abc", "sends the refresh token to the State Machine logout");

// It never throws and never calls out without a token.
calls = [];
assert.equal(await endSession(""), false);
assert.equal(calls.length, 0);
logoutStatus = 500;
assert.equal(await endSession("refresh-abc"), false, "a failing State Machine does not break sign-out");

console.log("Logout passed.");
