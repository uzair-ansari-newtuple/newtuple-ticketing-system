import { createHash } from "node:crypto";
import { SmError, smBaseUrl, smFetch } from "@/lib/sm/client";
import type { UserRole } from "@/lib/types";

const TIMEOUT_MS = 8000;
const CACHE_MS = 60_000;
/** An account with no assignment is looked up again soon, so a store added in the State Machine shows up quickly. */
const NO_STORE_CACHE_MS = 10_000;
const STORE_ROLE = "storeassociate";
const RESOLVER_ROLE = "resolver";
const SUPERADMIN_ROLES = new Set(["superadmin", "superadministrator", "platformsuperadmin"]);
const ASSIGNMENT_TYPE = "store_assignment";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  store_id: string | null;
  store_name: string;
  /** "assigned": the store is known. "none": the State Machine has no assignment for this account. "unavailable": the lookup failed, so the store is unknown right now. */
  store_status: StoreStatus;
}

export type StoreStatus = "assigned" | "none" | "unavailable";

export interface Tokens {
  access_token: string;
  refresh_token: string;
}

export type SignIn = { ok: true; tokens: Tokens; user: AppUser } | { ok: false; status: number; detail: string };

const cache = new Map<string, { user: AppUser | null; expires: number }>();
const cacheKey = (token: string) => createHash("sha256").update(token).digest("hex");

/** Thrown when the State Machine cannot answer right now. It is never the same thing as "this user has no access". */
export class IdentityUnavailable extends Error {}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs a State Machine call, once more after a short pause when it fails for a reason that can pass. */
async function twice<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (first) {
    if (!(first instanceof IdentityUnavailable) && !(first instanceof SmError && first.status >= 500)) throw first;
    await wait(250);
    return run();
  }
}

async function smAs<T>(token: string, path: string): Promise<{ status: number; body: T | null }> {
  let res: Response;
  try {
    res = await fetch(`${smBaseUrl()}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new IdentityUnavailable(e instanceof Error ? e.message : "State Machine did not answer");
  }
  if (res.status >= 500 || res.status === 429) throw new IdentityUnavailable(`State Machine answered ${res.status} for ${path}`);
  return { status: res.status, body: res.ok ? ((await res.json()) as T) : null };
}

type AssignmentRows = { items?: { data: Record<string, unknown> }[] };

function pickAssignment(rows: AssignmentRows | null, email: string): { store_id: string; store_name: string } | null {
  const record = (rows?.items ?? []).find((r) => String(r.data.user_email).toLowerCase() === email.toLowerCase());
  return record ? { store_id: String(record.data.store_id), store_name: String(record.data.store_name ?? record.data.store_id) } : null;
}

type Store = { store_id: string; store_name: string };
type StoreLookup = { state: "assigned"; store: Store } | { state: "none" } | { state: "unavailable" };

/**
 * Finds the store assigned to an account. Asks as the service account first and, when that finds nothing or fails,
 * asks again with the user's own token, which can always see their own assignment.
 * "none" means a lookup worked and found no assignment. "unavailable" means no lookup worked, so nothing is known.
 */
async function resolveStore(email: string, userToken: string): Promise<StoreLookup> {
  const path = `/entity-records?entity_type_name=${ASSIGNMENT_TYPE}&search=${encodeURIComponent(email)}&limit=100`;
  let answered = false;

  try {
    const asService = await twice(() => smFetch<AssignmentRows>("GET", path));
    answered = true;
    const store = pickAssignment(asService, email);
    if (store) return { state: "assigned", store };
  } catch (e) {
    console.warn(`store lookup as the service account failed for ${email}:`, e instanceof Error ? e.message : e);
  }

  try {
    const asUser = await twice(() => smAs<AssignmentRows>(userToken, path));
    if (asUser.body) {
      answered = true;
      const store = pickAssignment(asUser.body, email);
      if (store) return { state: "assigned", store };
    } else if (asUser.status !== 401) {
      console.warn(`store lookup as ${email} was refused (${asUser.status})`);
    }
  } catch (e) {
    console.warn(`store lookup as ${email} failed:`, e instanceof Error ? e.message : e);
  }

  return { state: answered ? "none" : "unavailable" };
}

const normalizedRole = (name: string) => name.toLowerCase().replace(/[ _-]/g, "");

export function ticketingRoleFromNames(names: string[]): UserRole | null {
  const normalized = names.map(normalizedRole);
  if (normalized.some((name) => SUPERADMIN_ROLES.has(name))) return "superadmin";
  if (normalized.includes(RESOLVER_ROLE)) return "resolver";
  if (normalized.includes(STORE_ROLE)) return "store";
  return null;
}

/** True only for the State Machine's platform Super Administrator role names. */
export const isSuperAdmin = (user: AppUser | null | undefined): user is AppUser & { role: "superadmin" } => user?.role === "superadmin";

/** Turns a State Machine token into an app user: profile and role from the user's token, and a store assignment when the account is a store associate. */
async function buildUser(token: string): Promise<AppUser | null> {
  const [me, permissions] = await Promise.all([
    smAs<{ id: string; email: string; full_name: string }>(token, "/auth/me"),
    smAs<{ roles: { name: string }[] }>(token, "/roles/my-permissions"),
  ]);
  if (!me.body || !permissions.body) return null;
  const role = ticketingRoleFromNames(permissions.body.roles.map((r) => r.name));
  if (!role) return null;
  const user: AppUser = {
    id: me.body.id,
    name: me.body.full_name,
    email: me.body.email,
    role,
    store_id: null,
    store_name: role === "resolver" ? "Resolver desk" : role === "superadmin" ? "All ticketing stores" : "",
    store_status: role === "resolver" ? "none" : "assigned",
  };
  if (role === "store" || role === "superadmin") {
    const lookup = await resolveStore(me.body.email, token);
    user.store_status = lookup.state;
    if (lookup.state === "assigned") {
      user.store_id = lookup.store.store_id;
      // A superadmin keeps access to every store; the assigned store is only the default for store-bound actions.
      user.store_name = role === "superadmin" ? `${lookup.store.store_name} · Super Admin` : lookup.store.store_name;
    }
  }
  return user;
}

/**
 * Who a request belongs to, or null when the token is missing, expired or the account has no access.
 * A real answer is cached briefly. A failed lookup is never cached, so one bad moment cannot stick to the account.
 */
export async function userFromToken(token: string): Promise<AppUser | null> {
  if (!token) return null;
  const key = cacheKey(token);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.user;
  let user: AppUser | null;
  try {
    user = await buildUser(token);
  } catch (e) {
    if (e instanceof IdentityUnavailable) {
      console.warn("could not identify the user:", e.message);
      return null;
    }
    throw e;
  }
  if (user?.store_status !== "unavailable") cache.set(key, { user, expires: Date.now() + (user?.store_status === "none" ? NO_STORE_CACHE_MS : CACHE_MS) });
  return user;
}

/** Signs in with the State Machine. A superadmin is authorized across ticketing records and does not need a store assignment. */
export async function signIn(email: string, password: string): Promise<SignIn> {
  const res = await fetch(`${smBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as (Tokens & { detail?: string }) | null;
  if (!res.ok || !body?.access_token) return { ok: false, status: res.status === 403 ? 403 : 401, detail: typeof body?.detail === "string" ? body.detail : "Invalid email or password" };
  let user: AppUser | null;
  try {
    user = await buildUser(body.access_token);
  } catch (e) {
    if (e instanceof IdentityUnavailable) return { ok: false, status: 503, detail: "Sign in is unavailable right now. Try again shortly." };
    throw e;
  }
  // A store associate whose store could not be looked up is not signed in half-way; they try again.
  if (user?.role === "store" && user.store_status === "unavailable") return { ok: false, status: 503, detail: "We could not look up your store right now. Try again shortly." };
  if (user?.role === "store" && user.store_status === "none") return { ok: false, status: 403, detail: "No store is assigned to this account yet. Ask an admin to add it to a store." };
  if (!user) return { ok: false, status: 403, detail: "This account is not set up for the ticketing app. Ask an admin to give it the Store Associate, Resolver, or Super Administrator role." };
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
