// Tests sign-in and access rules. Users, roles and store assignments all live in the State Machine.
process.loadEnvFile(".env");
const APP = "http://localhost:3000/api/mock", SM = process.env.SM_BASE_URL;
const call = async (base, path, o = {}) => {
  const res = await fetch(base + path, { method: o.method ?? "POST", headers: { "content-type": "application/json", ...(o.headers ?? {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
  return { s: res.status, b: await res.json().catch(() => null) };
};
let failures = 0, total = 0;
const check = (name, ok, detail = "") => { total++; if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`); };
const login = (email, password) => call(APP, "/auth/login", { body: { email, password } });
const bearer = (t) => ({ authorization: `Bearer ${t}` });
const E = process.env;
console.log("== Sign-in ==");
const store = await login(E.DEMO_STORE_EMAIL, E.DEMO_STORE_PASSWORD);
check("store user signs in", store.s === 200 && store.b.user.role === "store", JSON.stringify(store.b)?.slice(0, 120));
check("the store id and store name come from the State Machine", store.b.user.store_id === "ST-112" && store.b.user.store_name.includes("Atlanta"), JSON.stringify(store.b.user));
check("the name comes from the State Machine profile", store.b.user.name === "Ticketing Store", store.b.user.name);
check("the app returns the State Machine's own tokens", Boolean(store.b.access_token) && Boolean(store.b.refresh_token));
const resolver = await login(E.DEMO_RESOLVER_EMAIL, E.DEMO_RESOLVER_PASSWORD);
check("resolver signs in with no store", resolver.s === 200 && resolver.b.user.role === "resolver" && resolver.b.user.store_id === null, JSON.stringify(resolver.b?.user));
check("wrong password is refused", (await login(E.DEMO_STORE_EMAIL, "wrong-password-1")).s === 401);
check("unknown email is refused", (await login("nobody@newtuple.com", "whatever-1234")).s === 401);
check("blank email and password are refused", (await login("", "")).s === 401);
const admin = await login(E.SM_EMAIL, E.SM_PASSWORD);
check("an account with no ticketing role is refused with an explanation", admin.s === 403 && /not set up/.test(admin.b?.detail ?? ""), `${admin.s} ${admin.b?.detail}`);

console.log("\n== Access rules ==");
const sh = bearer(store.b.access_token), rh = bearer(resolver.b.access_token);
check("no token is refused", (await call(APP, "/incidents", { method: "GET" })).s === 401);
check("a made-up token is refused", (await call(APP, "/incidents", { method: "GET", headers: bearer("not.a.token") })).s === 401);
check("the old app-signed token format is refused", (await call(APP, "/incidents", { method: "GET", headers: bearer("t1.u-112.9999999999999.abc") })).s === 401);
check("the store user can list its tickets", (await call(APP, "/incidents", { method: "GET", headers: sh })).s === 200);
check("the resolver cannot create tickets", (await call(APP, "/incidents", { headers: rh, body: {} })).s === 401);

console.log("\n== A store only sees its own tickets ==");
const mine = (await call(APP, "/incidents", { method: "GET", headers: sh })).b.items[0];
const svc0 = (await call(SM, "/auth/login", { body: { email: E.SM_EMAIL, password: E.SM_PASSWORD } })).b.access_token;
await call(SM, `/entity-records/${mine.id}`, { method: "PUT", headers: bearer(svc0), body: { data: { store_id: "ST-999" } } });
check("a ticket from another store is hidden (404)", (await call(APP, `/incidents/${mine.id}`, { method: "GET", headers: sh })).s === 404);
check("and does not appear in the list", !(await call(APP, "/incidents", { method: "GET", headers: sh })).b.items.some((i) => i.id === mine.id));
await call(SM, `/entity-records/${mine.id}`, { method: "PUT", headers: bearer(svc0), body: { data: { store_id: "ST-112" } } });
check("restored, the ticket is visible again", (await call(APP, `/incidents/${mine.id}`, { method: "GET", headers: sh })).s === 200);

console.log("\n== Token refresh ==");
const fresh = await call(APP, "/auth/refresh", { body: { refresh_token: store.b.refresh_token } });
check("a refresh token gives a new access token", fresh.s === 200 && Boolean(fresh.b.access_token), `${fresh.s}`);
check("the new access token works", (await call(APP, "/incidents", { method: "GET", headers: bearer(fresh.b.access_token) })).s === 200);
check("a bad refresh token is refused", (await call(APP, "/auth/refresh", { body: { refresh_token: "garbage" } })).s === 401);
check("a missing refresh token is refused", (await call(APP, "/auth/refresh", { body: {} })).s === 401);

console.log("\n== A store user with no store assignment ==");
const svc = (await call(SM, "/auth/login", { body: { email: E.SM_EMAIL, password: E.SM_PASSWORD } })).b.access_token;
const smh = bearer(svc);
const list = (await call(SM, `/entity-records?entity_type_name=store_assignment&search=${encodeURIComponent(E.DEMO_STORE_EMAIL)}&limit=5`, { method: "GET", headers: smh })).b.items;
const matching = list.filter((r) => r.data.user_email === E.DEMO_STORE_EMAIL);
const record = matching[0];
const deletes = await Promise.all(matching.map((r) => call(SM, `/entity-records/${r.entity_id}`, { method: "DELETE", headers: smh })));
const del = { s: deletes.every((d) => d.s === 200) ? 200 : 500 };
await new Promise((r) => setTimeout(r, 200));
const noStore = await login(E.DEMO_STORE_EMAIL, E.DEMO_STORE_PASSWORD);
check("signing in is refused when no store is assigned", del.s === 200 && noStore.s === 403, `delete ${del.s}, login ${noStore.s}`);
const type = (await call(SM, "/entity-types/store_assignment", { method: "GET", headers: smh })).b;
const back = await call(SM, "/entity-records", { headers: smh, body: { entity_type_id: type.entity_type_id, data: record.data } });
check("the assignment can be put back", back.s === 201, `${back.s}`);
const again = await login(E.DEMO_STORE_EMAIL, E.DEMO_STORE_PASSWORD);
check("and then sign-in works again with the same store", again.s === 200 && again.b.user.store_id === "ST-112", `${again.s}`);

console.log("\n== Changing the store in the State Machine takes effect ==");
const rec2 = (await call(SM, `/entity-records?entity_type_name=store_assignment&search=${encodeURIComponent(E.DEMO_STORE_EMAIL)}&limit=5`, { method: "GET", headers: smh })).b.items.find((r) => r.data.user_email === E.DEMO_STORE_EMAIL);
await call(SM, `/entity-records/${rec2.entity_id}`, { method: "PUT", headers: smh, body: { data: { ...rec2.data, store_id: "ST-205", store_name: "Store #205 · Dallas, TX" } } });
const moved = await login(E.DEMO_STORE_EMAIL, E.DEMO_STORE_PASSWORD);
check("a store change in the State Machine shows at the next sign-in", moved.b?.user?.store_id === "ST-205", JSON.stringify(moved.b?.user));
await call(SM, `/entity-records/${rec2.entity_id}`, { method: "PUT", headers: smh, body: { data: rec2.data } });
check("and changing it back restores the original", (await login(E.DEMO_STORE_EMAIL, E.DEMO_STORE_PASSWORD)).b?.user?.store_id === "ST-112");

console.log(`\nTOTAL ${total}  PASS ${total - failures}  FAIL ${failures}`);
process.exit(failures ? 1 : 0);
