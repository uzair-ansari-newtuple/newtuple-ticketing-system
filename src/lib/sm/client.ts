const TIMEOUT_MS = 15_000;
const TOKEN_TTL_MS = 10 * 60 * 1000;

let cached: { token: string; expires: number } | null = null;

export const smBaseUrl = () => process.env.SM_BASE_URL?.replace(/\/$/, "") ?? "";
export const smMachine = () => process.env.SM_MACHINE_NAME ?? "workflow_dguyp0t8_9f7jus";
export const smEntityType = () => process.env.SM_ENTITY_TYPE ?? "incident";

export const smEnabled = () => Boolean(smBaseUrl() && process.env.SM_EMAIL && process.env.SM_PASSWORD);

async function login(): Promise<string> {
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

export class SmError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Calls the State Machine as the service user, signing in again once if the token was rejected. */
async function request(method: string, path: string, init: { body?: BodyInit; json?: boolean }): Promise<Response> {
  for (const force of [false, true]) {
    const res = await fetch(`${smBaseUrl()}${path}`, {
      method,
      headers: { authorization: `Bearer ${await token(force)}`, ...(init.json ? { "content-type": "application/json" } : {}) },
      body: init.body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401 && !force) continue;
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      let detail = text;
      try {
        const parsed = JSON.parse(text) as { detail?: unknown };
        if (typeof parsed.detail === "string") detail = parsed.detail;
      } catch {
        // not JSON, keep the text
      }
      throw new SmError(res.status, detail);
    }
    return res;
  }
  throw new SmError(401, "State machine rejected the service login");
}

export async function smFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await request(method, path, { json: true, body: body === undefined ? undefined : JSON.stringify(body) });
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export async function smDownload(path: string): Promise<{ bytes: Buffer; contentType: string }> {
  const res = await request("GET", path, {});
  return { bytes: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
}

export async function smUpload<T>(path: string, form: FormData): Promise<T> {
  const res = await request("POST", path, { body: form });
  return (await res.json()) as T;
}
