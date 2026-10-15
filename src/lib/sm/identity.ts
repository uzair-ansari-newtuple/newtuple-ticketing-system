import { createHash } from "node:crypto";
import { smBaseUrl, smFetch } from "@/lib/sm/client";
import type { UserRole } from "@/lib/types";

const TIMEOUT_MS = 8000;
const CACHE_MS = 60_000;
const STORE_ROLE = "store_associate";
const RESOLVER_ROLE = "resolver";
const ASSIGNMENT_TYPE = "store_assignment";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  store_id: string | null;
  store_name: string;
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
}

export type SignIn = { ok: true; tokens: Tokens; user: AppUser } | { ok: false; status: number; detail: string };

const cache = new Map<string, { user: AppUser | null; expires: number }>();
const cacheKey = (token: string) => createHash("sha256").update(token).digest("hex");

async function smAs<T>(token: string, path: string): Promise<{ status: number; body: T | null }> {
  const res = await fetch(`${smBaseUrl()}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { status: res.status, body: res.ok ? ((await res.json()) as T) : null };
}

async function storeFor(email: string): Promise<{ store_id: string; store_name: string } | null> {
  const found = await smFetch<{ items?: { data: Record<string, unknown> }[] }>("GET", `/entity-records?entity_type_name=${ASSIGNMENT_TYPE}&search=${encodeURIComponent(email)}&limit=10`);
  const record = (found.items ?? []).find((r) => String(r.data.user_email).toLowerCase() === email.toLowerCase());
  return record ? { store_id: String(record.data.store_id), store_name: String(record.data.store_name ?? record.data.store_id) } : null;
}

/** Turns a State Machine token into an app user: name and email from the profile, role from the State Machine role, store from the user's store assignment. */
async function buildUser(token: string): Promise<AppUser | null> {
  const [me, permissions] = await Promise.all([
    smAs<{ id: string; email: string; full_name: string }>(token, "/auth/me"),
    smAs<{ roles: { name: string }[] }>(token, "/roles/my-permissions"),
  ]);
  if (!me.body || !permissions.body) return null;
  const names = permissions.body.roles.map((r) => r.name);
  const role: UserRole | null = names.includes(RESOLVER_ROLE) ? "resolver" : names.includes(STORE_ROLE) ? "store" : null;
  if (!role) return null;
  const user: AppUser = { id: me.body.id, name: me.body.full_name, email: me.body.email, role, store_id: null, store_name: role === "resolver" ? "Resolver desk" : "" };
  if (role === "store") {
    const store = await storeFor(me.body.email);
    if (!store) return null;
    user.store_id = store.store_id;
    user.store_name = store.store_name;
  }
  return user;
}

/** Who a request belongs to, or null when the token is missing, expired or the account has no access. Answers are cached briefly. */
export async function userFromToken(token: string): Promise<AppUser | null> {
  if (!token) return null;
  const key = cacheKey(token);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.user;
  const user = await buildUser(token);
  cache.set(key, { user, expires: Date.now() + CACHE_MS });
  return user;
}

/** Signs in with the State Machine. The account must have a role the ticketing app understands, and a store assignment if it is a store user. */
export async function signIn(email: string, password: string): Promise<SignIn> {
  const res = await fetch(`${smBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as (Tokens & { detail?: string }) | null;
  if (!res.ok || !body?.access_token) return { ok: false, status: res.status === 403 ? 403 : 401, detail: typeof body?.detail === "string" ? body.detail : "Invalid email or password" };
  const user = await buildUser(body.access_token);
  if (!user) return { ok: false, status: 403, detail: "This account is not set up for the ticketing app. Ask an admin to give it the Store Associate or Resolver role." };
  return { ok: true, tokens: { access_token: body.access_token, refresh_token: body.refresh_token }, user };
}

export async function refresh(refreshToken: string): Promise<Tokens | null> {
  const res = await fetch(`${smBaseUrl()}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as Tokens;
  return { access_token: body.access_token, refresh_token: body.refresh_token ?? refreshToken };
}
