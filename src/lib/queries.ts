"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { IncidentState } from "@/lib/types";
import { useSession } from "@/store/session";

const PENDING: IncidentState[] = ["METADATA_PENDING"];
const POLL_MS = 8_000;

export function useIncidents() {
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: ["incidents"], queryFn: () => api.listIncidents(token!), enabled: Boolean(token), refetchInterval: POLL_MS });
}

export function useIncident(id: string) {
  const token = useSession((s) => s.token);
  return useQuery({
    queryKey: ["incident", id],
    queryFn: () => api.getIncident(token!, id),
    enabled: Boolean(token),
    refetchInterval: (q) => (q.state.data && PENDING.includes(q.state.data.state) ? 1500 : POLL_MS),
  });
}

export function useIncidentImages(id: string) {
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: ["incident-images", id], queryFn: () => api.getIncidentImages(token!, id), enabled: Boolean(token), staleTime: Infinity });
}
