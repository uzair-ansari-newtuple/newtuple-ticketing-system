"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/store/session";

const POLL_MS = 8_000;
const useToken = () => useSession((s) => s.token);

export function useShipments() {
  const token = useToken();
  return useQuery({ queryKey: ["qc-shipments"], queryFn: () => api.qcShipments(token!), enabled: Boolean(token), refetchInterval: POLL_MS });
}

export function useShipment(id: string) {
  const token = useToken();
  return useQuery({ queryKey: ["qc-shipment", id], queryFn: () => api.qcShipment(token!, id), enabled: Boolean(token), refetchInterval: POLL_MS });
}

export function useUpc(id: string | null) {
  const token = useToken();
  return useQuery({ queryKey: ["qc-upc", id], queryFn: () => api.qcUpc(token!, id!), enabled: Boolean(token && id) });
}

export function useNotifications() {
  const token = useToken();
  return useQuery({ queryKey: ["qc-notifications"], queryFn: () => api.qcNotifications(token!), enabled: Boolean(token), refetchInterval: POLL_MS });
}

export function useFlagged() {
  const token = useToken();
  return useQuery({ queryKey: ["qc-flagged"], queryFn: () => api.qcFlagged(token!), enabled: Boolean(token), refetchInterval: POLL_MS });
}

/** Everything a step in the flow can change, so the lists, the shipment, the UPC and the flags all refresh together. */
export function useQcRefresh() {
  const client = useQueryClient();
  return () => Promise.all(["qc-shipments", "qc-shipment", "qc-upc", "qc-flagged", "qc-notifications"].map((key) => client.invalidateQueries({ queryKey: [key] })));
}

export function useQcMutations() {
  const token = useToken()!;
  const refresh = useQcRefresh();
  const done = { onSuccess: refresh };
  return {
    fetch: useMutation({ mutationFn: () => api.qcFetch(token), ...done }),
    start: useMutation({ mutationFn: (ids: string[]) => api.qcStart(token, ids), ...done }),
    complete: useMutation({ mutationFn: (id: string) => api.qcComplete(token, id), ...done }),
    receipt: useMutation({ mutationFn: (v: { id: string } & Parameters<typeof api.qcReceipt>[2]) => api.qcReceipt(token, v.id, v), ...done }),
    pallet: useMutation({ mutationFn: (v: { upcId: string; palletId: string } & Parameters<typeof api.qcPallet>[3]) => api.qcPallet(token, v.upcId, v.palletId, v), ...done }),
    addPallet: useMutation({ mutationFn: (id: string) => api.qcAddPallet(token, id), ...done }),
    photo: useMutation({ mutationFn: (v: { id: string; photo: string }) => api.qcPhoto(token, v.id, v.photo), ...done }),
    approve: useMutation({ mutationFn: (id: string) => api.qcApprove(token, id), ...done }),
    flag: useMutation({ mutationFn: (v: { id: string } & Parameters<typeof api.qcFlag>[2]) => api.qcFlag(token, v.id, v), ...done }),
    resolve: useMutation({ mutationFn: (v: { id: string } & Parameters<typeof api.qcResolve>[2]) => api.qcResolve(token, v.id, v), ...done }),
    reopen: useMutation({ mutationFn: (v: { id: string; reason: string }) => api.qcReopen(token, v.id, v.reason), ...done }),
  };
}
