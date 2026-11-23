// Checks how the app decides a user's store when the State Machine misbehaves. No network: fetch is replaced.
import assert from "node:assert/strict";

process.env.SM_BASE_URL = "https://sm.test/api";
process.env.SM_EMAIL = "service@test";
process.env.SM_PASSWORD = "x";

const { userFromToken, signIn } = await import("../src/lib/sm/identity");
const { requireStore } = await import("../src/lib/mock/http");

type Mode = { serviceSearch: number | "ok" | "empty"; userSearch: number | "ok" | "empty"; me?: number; role?: string };
let mode: Mode = { serviceSearch: "ok", userSearch: "ok" };
let calls = 0;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const assignment = { items: [{ data: { user_email: "boss@test", store_id: "ST-112", store_name: "Store #112" } }] };

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const auth = String((init?.headers as Record<string, string> | undefined)?.authorization ?? "");
  calls++;
  if (url.endsWith("/auth/login")) return json(200, { access_token: "service-token", refresh_token: "r" });
  if (url.endsWith("/auth/me")) return mode.me ? json(mode.me, {}) : json(200, { id: "u1", email: "boss@test", full_name: "Boss" });
  if (url.endsWith("/roles/my-permissions")) return json(200, { roles: [{ name: mode.role ?? "superadmin" }] });
  if (url.includes("/entity-records")) {
    const m = auth.includes("service-token") ? mode.serviceSearch : mode.userSearch;
    if (typeof m === "number") return json(m, { detail: "boom" });
    return json(200, m === "ok" ? assignment : { items: [] });
  }
  return json(404, {});
}) as typeof fetch;

let n = 0;
const fresh = () => `token-${++n}`; // a new token each time, so the cache never hides a case

// 1. The service account cannot read the assignment, the user's own token can: the store is found.
mode = { serviceSearch: 403, userSearch: "ok" };
let u = await userFromToken(fresh());
assert.equal(u?.store_id, "ST-112");
assert.equal(u?.store_status, "assigned");

// 2. The service account has an outage, the user's token still works.
mode = { serviceSearch: 503, userSearch: "ok" };
u = await userFromToken(fresh());
assert.equal(u?.store_id, "ST-112");

// 3. Both lookups answer "nothing": that is a real "no store".
mode = { serviceSearch: "empty", userSearch: "empty" };
u = await userFromToken(fresh());
assert.equal(u?.store_id, null);
assert.equal(u?.store_status, "none");

// 4. Both lookups fail: the store is unknown, which is not the same as none.
mode = { serviceSearch: 503, userSearch: 503 };
const failing = fresh();
u = await userFromToken(failing);
assert.equal(u?.store_id, null);
assert.equal(u?.store_status, "unavailable");

// 5. The failure is not cached: the same token is looked up again and now works.
mode = { serviceSearch: "ok", userSearch: "ok" };
u = await userFromToken(failing);
assert.equal(u?.store_id, "ST-112", "a failed lookup must not stick to the token");

// 6. A good answer is cached, so a second call does not ask again.
const good = fresh();
await userFromToken(good);
const before = calls;
await userFromToken(good);
assert.equal(calls, before, "a good answer is reused");

// 7. The State Machine failing on /auth/me is not an answer either, and is not cached.
mode = { serviceSearch: "ok", userSearch: "ok", me: 503 };
const flaky = fresh();
assert.equal(await userFromToken(flaky), null);
mode = { serviceSearch: "ok", userSearch: "ok" };
assert.equal((await userFromToken(flaky))?.store_id, "ST-112");

// 8. What each store-bound route says.
mode = { serviceSearch: "empty", userSearch: "empty" };
const none = await userFromToken(fresh());
assert.equal(requireStore(none).error?.status, 409);
mode = { serviceSearch: 503, userSearch: 503 };
const unknown = await userFromToken(fresh());
assert.equal(requireStore(unknown).error?.status, 503);
assert.equal(requireStore(null).error?.status, 401);
mode = { serviceSearch: "ok", userSearch: "ok" };
assert.equal(requireStore(await userFromToken(fresh())).user?.store_id, "ST-112");

// 9. A store associate: signs in with a store, is refused with a clear reason without one, and told to retry when the lookup failed.
globalThis.fetch = ((orig) => (async (input: RequestInfo | URL, init?: RequestInit) => (String(input).endsWith("/auth/login") && !String((init?.body as string) ?? "").includes("service@test") ? json(200, { access_token: "user-token", refresh_token: "r" }) : orig(input, init))) as typeof fetch)(globalThis.fetch);
mode = { serviceSearch: "ok", userSearch: "ok", role: "store_associate" };
let result = await signIn("boss@test", "pw");
assert.ok(result.ok && result.user.store_id === "ST-112");
mode = { serviceSearch: "empty", userSearch: "empty", role: "store_associate" };
result = await signIn("boss@test", "pw");
assert.ok(!result.ok && result.status === 403 && /No store is assigned/.test(result.detail));
mode = { serviceSearch: 503, userSearch: 503, role: "store_associate" };
result = await signIn("boss@test", "pw");
assert.ok(!result.ok && result.status === 503);
// A superadmin may sign in without a store.
mode = { serviceSearch: "empty", userSearch: "empty", role: "superadmin" };
result = await signIn("boss@test", "pw");
assert.ok(result.ok && result.user.store_id === null && result.user.store_status === "none");

console.log("Store resolution passed.");
