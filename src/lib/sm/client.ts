const TIMEOUT_MS = 8000;
const TOKEN_TTL_MS = 10 * 60 * 1000;

let cached: { token: string; expires: number } | null = null;

export const smBaseUrl = () => process.env.SM_BASE_URL?.replace(/\/$/, "") ?? "";
export const smMachine = () => process.env.SM_MACHINE_NAME ?? "workflow_dguyp0t8_9f7jus";
export const smEntityType = () => process.env.SM_ENTITY_TYPE ?? "incident";

export const smLoginEnabled = () => Boolean(smBaseUrl());

export const smEnabled = () => Boolean(smBaseUrl() && (process.env.SM_ACCESS_TOKEN || (process.env.SM_EMAIL && process.env.SM_PASSWORD)));

async function login(): Promise<string> {
  if (process.env.SM_ACCESS_TOKEN) return process.env.SM_ACCESS_TOKEN;
  const res = await fetch(`${smBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: process.env.SM_EMAIL, password: process.env.SM_PASSWORD }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`State machine login failed (${res.status})`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function token(force: boolean): Promise<string> {
  if (!force && cached && cached.expires > Date.now()) return cached.token;
  const fresh = await login();
  cached = { token: fresh, expires: Date.now() + TOKEN_TTL_MS };
  return fresh;
}

/** Calls the State Machine API as the service user, signing in again once if the token was rejected. */
export async function smFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
  for (const force of [false, true]) {
    const res = await fetch(`${smBaseUrl()}${path}`, {
      method,
      headers: { authorization: `Bearer ${await token(force)}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401 && !force) continue;
    if (!res.ok) throw new Error(`State machine ${method} ${path} failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  }
  throw new Error("unreachable");
}

export type SmLogin = { ok: true; email: string } | { ok: false; status: number; detail: string };

/** Checks an email and password against the State Machine. The app keeps the role and store of each user in its own database. */
export async function smSignIn(email: string, password: string): Promise<SmLogin> {
  const res = await fetch(`${smBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as { detail?: string; user?: { email?: string } } | null;
  if (!res.ok) return { ok: false, status: res.status, detail: typeof body?.detail === "string" ? body.detail : "Sign in failed" };
  return { ok: true, email: body?.user?.email ?? email };
}
