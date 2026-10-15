import type {
  EscalationReason,
  IncidentDetail,
  IncidentSummary,
  ItemAge,
  ResolverDecision,
  Disposition,
  StoredImage,
  Job,
  ImagePayload,
  Incident,
  IncidentCreateBody,
  NormalizedMetadata,
  LoginResponse,
  PipelineStatus,
  QualityCheckResult,
} from "@/lib/types";

const BASE = "/api/mock";
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, typeof body.detail === "string" ? body.detail : `Request failed (${res.status})`);
  return body as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const api = {
  loginProvider: () => request<{ provider: "local" | "state-machine" }>("/auth/login").then((r) => r.provider),
  login: (username: string, password: string) =>
    request<LoginResponse>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),

  async runQualityCheck(
    token: string,
    images: ImagePayload[],
    onProgress: (progress: number) => void,
  ): Promise<QualityCheckResult> {
    const { job_id } = await request<{ job_id: string }>("/quality-check", {
      method: "POST",
      token,
      body: JSON.stringify({ capture_profile_id: "PHOTO_LANE", images }),
    });
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS / 2);
      const job = await request<Job<QualityCheckResult>>(`/jobs/${job_id}`, { token });
      onProgress(job.progress);
      if (job.status === "completed" && job.result) return job.result;
      if (job.status === "failed") throw new ApiError(500, job.error_message ?? "Quality check failed");
    }
    throw new ApiError(504, "Quality check timed out");
  },

  addReference: (token: string, body: { metadata: NormalizedMetadata; thumb: string; embeddings: number[][] }) =>
    request<{ id: string }>("/library", { method: "POST", token, body: JSON.stringify(body) }),

  listIncidents: (token: string) => request<{ items: IncidentSummary[] }>("/incidents", { token }),

  getIncident: (token: string, id: string) => request<IncidentDetail>(`/incidents/${id}`, { token }),

  getIncidentImages: (token: string, id: string) => request<{ images: StoredImage[] }>(`/incidents/${id}/images`, { token }),

  confirmIncident: (token: string, id: string, candidateKey: string | null, itemCount?: number) =>
    request<{ state: string }>(`/incidents/${id}/confirm`, { method: "POST", token, body: JSON.stringify({ candidate_key: candidateKey, acknowledged: true, missing_price_tag_count: itemCount }) }),

  escalateIncident: (token: string, id: string, body: { reason: EscalationReason; note: string; item_age: ItemAge; missing_price_tag_count: number }) =>
    request<{ state: string }>(`/incidents/${id}/escalate`, { method: "POST", token, body: JSON.stringify(body) }),

  setDisposition: (token: string, id: string, disposition: Disposition) =>
    request<{ state: string }>(`/incidents/${id}/disposition`, { method: "POST", token, body: JSON.stringify({ disposition }) }),

  confirmNewTag: (token: string, id: string) => request<{ state: string }>(`/incidents/${id}/new-tag-added`, { method: "POST", token }),

  async markRead(token: string, id: string): Promise<void> {
    await fetch(`${BASE}/incidents/${id}/read`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  },

  printLabel: (token: string, body: { incident_id: string; printer: number; copies: number }) =>
    request<{ request_id: string; message: string }>("/label-print", { method: "POST", token, body: JSON.stringify(body) }),

  resolverQueue: (token: string) => request<{ items: IncidentSummary[] }>("/resolver/queue", { token }),

  resolverClaim: (token: string, id: string) => request<{ state: string }>(`/resolver/incidents/${id}/claim`, { method: "POST", token }),

  resolverRespond: (token: string, id: string, body: { decision: ResolverDecision; sku?: string; comment: string }) =>
    request<{ state: string }>(`/resolver/incidents/${id}/respond`, { method: "POST", token, body: JSON.stringify(body) }),

  searchProducts: (token: string, q: string) => request<{ items: NormalizedMetadata[] }>(`/products?q=${encodeURIComponent(q)}`, { token }),

  createIncident: (
    token: string,
    body: IncidentCreateBody,
  ) =>
    request<Incident>("/incidents", {
      method: "POST",
      token,
      body: JSON.stringify({ capture_profile_id: "PHOTO_LANE", ...body }),
    }),

  getPipeline: (token: string, id: string) => request<PipelineStatus>(`/incidents/${id}/pipeline`, { token }),

  advancePipeline: (token: string, id: string, trigger: string) =>
    request<{ state: string }>(`/incidents/${id}/advance`, { method: "POST", token, body: JSON.stringify({ trigger }) }),
};
