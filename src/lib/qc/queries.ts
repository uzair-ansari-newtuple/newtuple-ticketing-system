"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/store/session";

const POLL_MS = 8_000;
const useToken = () => useSession((s) => s.token);

export function useQcPos() {
  const token = useToken();
  return useQuery({ queryKey: ["qc-pos"], queryFn: () => api.qcPos(token!), enabled: Boolean(token), refetchInterval: POLL_MS });
}

export function useQcPo(id: string) {
  const token = useToken();
  return useQuery({ queryKey: ["qc-po", id], queryFn: () => api.qcPo(token!, id), enabled: Boolean(token), refetchInterval: POLL_MS });
}

export function useQcLine(id: string) {
  const token = useToken();
  return useQuery({ queryKey: ["qc-line", id], queryFn: () => api.qcLine(token!, id), enabled: Boolean(token) });
}

export function useQcExceptions() {
  const token = useToken();
  return useQuery({ queryKey: ["qc-exceptions"], queryFn: () => api.qcExceptions(token!), enabled: Boolean(token), refetchInterval: POLL_MS });
}

/** Everything a step in the flow can change, so the lists, the PO and the exceptions all refresh together. */
export function useQcRefresh() {
  const client = useQueryClient();
  return () => Promise.all(["qc-pos", "qc-po", "qc-line", "qc-exceptions"].map((key) => client.invalidateQueries({ queryKey: [key] })));
}

export function useQcMutations() {
  const token = useToken()!;
  const refresh = useQcRefresh();
  const done = { onSuccess: refresh };
  return {
    fetchPos: useMutation({ mutationFn: () => api.qcFetchPos(token), ...done }),
    start: useMutation({ mutationFn: (poIds: string[]) => api.qcStart(token, poIds), ...done }),
    complete: useMutation({ mutationFn: (v: { id: string; note?: string }) => api.qcComplete(token, v.id, v.note), ...done }),
    count: useMutation({ mutationFn: (v: { id: string; received_qty: number; photo: string }) => api.qcCount(token, v.id, { received_qty: v.received_qty, photo: v.photo }), ...done }),
    exception: useMutation({ mutationFn: (v: { id: string } & Parameters<typeof api.qcException>[2]) => api.qcException(token, v.id, v), ...done }),
    recount: useMutation({ mutationFn: (id: string) => api.qcRecount(token, id), ...done }),
    resolve: useMutation({ mutationFn: (v: { id: string; note: string }) => api.qcResolve(token, v.id, v.note), ...done }),
  };
}
