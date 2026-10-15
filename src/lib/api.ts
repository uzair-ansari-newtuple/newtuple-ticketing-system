import type {
  EscalationReason,
  IncidentDetail,
  IncidentSummary,
  ItemAge,
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
import type { QcNotification } from "@/lib/qc/service";
import type { CheckKey, FlaggedUpc, FlagReason, Shipment, ShipmentDetail, UpcDetail } from "@/lib/qc/dto";
import { useSession } from "@/store/session";

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

let refreshing: Promise<string | null> | null = null;

/** Asks the State Machine for a fresh token. Calls made at the same moment share one refresh. */
function refreshAccessToken(): Promise<string | null> {
  refreshing ??= (async () => {
    const { refreshToken, setTokens, signOut } = useSession.getState();
    if (!refreshToken) return null;
    const res = await fetch(`${BASE}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: refreshToken }) });
    if (!res.ok) {
      signOut();
      return null;
    }
    const tokens = (await res.json()) as { access_token: string; refresh_token: string };
    setTokens(tokens.access_token, tokens.refresh_token);
    return tokens.access_token;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  const send = (bearer?: string) =>
    fetch(`${BASE}${path}`, { ...rest, headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...headers } });
  let res = await send(token);
  if (res.status === 401 && token) {
    const fresh = await refreshAccessToken();
    if (fresh) res = await send(fresh);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, typeof body.detail === "string" ? body.detail : `Request failed (${res.status})`);
  return body as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const api = {
  qcShipments: (token: string) => request<{ items: Shipment[] }>("/qc/shipments", { token }),
  qcFetch: (token: string) => request<{ created: string[]; items: Shipment[] }>("/qc/shipments/fetch", { method: "POST", token, body: "{}" }),
  qcStart: (token: string, ids: string[]) => request<{ items: Shipment[] }>("/qc/shipments/start", { method: "POST", token, body: JSON.stringify({ shipment_ids: ids }) }),
  qcShipment: (token: string, id: string) => request<ShipmentDetail>(`/qc/shipments/${id}`, { token }),
  qcComplete: (token: string, id: string) => request<ShipmentDetail>(`/qc/shipments/${id}/complete`, { method: "POST", token, body: "{}" }),
  qcReceipt: (token: string, id: string, body: { action: "start" | "close" | "return"; confirmation_number?: string; note?: string }) =>
    request<ShipmentDetail>(`/qc/shipments/${id}/receipt`, { method: "POST", token, body: JSON.stringify(body) }),
  qcUpc: (token: string, id: string) => request<UpcDetail>(`/qc/upcs/${id}`, { token }),
  qcPallet: (token: string, upcId: string, palletId: string, body: { checks?: Partial<Record<CheckKey, boolean>>; is_prepack?: boolean; mdl_actual?: number; bundles_per_case?: number; full_cases_count?: number; partial_units?: number }) =>
    request<UpcDetail>(`/qc/upcs/${upcId}/pallets/${palletId}`, { method: "POST", token, body: JSON.stringify(body) }),
  qcAddPallet: (token: string, id: string) => request<UpcDetail>(`/qc/upcs/${id}/pallets`, { method: "POST", token, body: "{}" }),
  qcPhoto: (token: string, id: string, photo: string) => request<UpcDetail>(`/qc/upcs/${id}/photo`, { method: "POST", token, body: JSON.stringify({ photo }) }),
  qcApprove: (token: string, id: string) => request<UpcDetail>(`/qc/upcs/${id}/approve`, { method: "POST", token, body: "{}" }),
  qcFlag: (token: string, id: string, body: { reason: FlagReason; note: string }) => request<UpcDetail>(`/qc/upcs/${id}/flag`, { method: "POST", token, body: JSON.stringify(body) }),
  qcResolve: (token: string, id: string, body: { action: "approve" | "return" | "wont_qc"; note: string }) => request<UpcDetail>(`/qc/upcs/${id}/resolve`, { method: "POST", token, body: JSON.stringify(body) }),
  qcReopen: (token: string, id: string, reason: string) => request<UpcDetail>(`/qc/upcs/${id}/reopen`, { method: "POST", token, body: JSON.stringify({ reason }) }),
  qcNotifications: (token: string) => request<{ items: QcNotification[] }>("/qc/notifications", { token }),
  qcFlagged: (token: string) => request<{ items: FlaggedUpc[] }>("/qc/exceptions", { token }),

  login: (email: string, password: string) =>
    request<LoginResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),

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

  addReference: (token: string, incidentId: string) => request<{ id: string }>("/library", { method: "POST", token, body: JSON.stringify({ incident_id: incidentId }) }),

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
