"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/store/session";

export function useDemoStatus() {
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: ["demo-status"], queryFn: () => api.demoStatus(token!), enabled: Boolean(token), refetchInterval: 6_000 });
}

export function useDemoReset() {
  const token = useSession((s) => s.token)!;
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.demoReset(token),
    onSuccess: () => Promise.all(["demo-status", "qc-shipments", "qc-shipment", "qc-upc", "qc-flagged", "qc-notifications", "incidents"].map((key) => client.invalidateQueries({ queryKey: [key] }))),
  });
}
