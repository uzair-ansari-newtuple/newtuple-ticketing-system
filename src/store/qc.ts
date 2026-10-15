import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SAMPLE_POS } from "@/data/qc";
import type { ExceptionReason, LineResult, PoProgress, PurchaseOrder } from "@/lib/qc/types";

interface QcState {
  pos: PurchaseOrder[];
  progress: Record<string, PoProgress>;
  selected: string[];
  fetchPos: () => void;
  toggleSelected: (poId: string) => void;
  clearSelected: () => void;
  startQc: (poIds: string[]) => void;
  verifyLine: (poId: string, upc: string, input: { receivedQty: number; photo: string }) => void;
  raiseException: (poId: string, upc: string, input: { receivedQty: number; photo: string | null; reason: ExceptionReason; note: string }) => void;
  resolveException: (poId: string, upc: string, note: string) => void;
  completePo: (poId: string) => void;
  resetDemo: () => void;
}

const fresh = (): PoProgress => ({ status: "FETCHED", startedAt: null, completedAt: null, results: {} });
const now = () => new Date().toISOString();

export const useQc = create<QcState>()(
  persist(
    (set) => {
      const patchPo = (poId: string, change: (p: PoProgress) => PoProgress) =>
        set((s) => ({ progress: { ...s.progress, [poId]: change(s.progress[poId] ?? fresh()) } }));
      const patchLine = (poId: string, upc: string, result: LineResult) =>
        patchPo(poId, (p) => ({ ...p, results: { ...p.results, [upc]: result } }));

      return {
        pos: [],
        progress: {},
        selected: [],
        fetchPos: () =>
          set((s) => ({
            pos: SAMPLE_POS,
            progress: Object.fromEntries(SAMPLE_POS.map((po) => [po.id, s.progress[po.id] ?? fresh()])),
          })),
        toggleSelected: (poId) => set((s) => ({ selected: s.selected.includes(poId) ? s.selected.filter((id) => id !== poId) : [...s.selected, poId] })),
        clearSelected: () => set({ selected: [] }),
        startQc: (poIds) =>
          set((s) => ({
            selected: [],
            progress: {
              ...s.progress,
              ...Object.fromEntries(
                poIds.map((id) => {
                  const p = s.progress[id] ?? fresh();
                  return [id, p.status === "FETCHED" ? { ...p, status: "IN_PROGRESS" as const, startedAt: now() } : p];
                }),
              ),
            },
          })),
        verifyLine: (poId, upc, { receivedQty, photo }) => patchLine(poId, upc, { status: "VERIFIED", receivedQty, photo, exception: null }),
        raiseException: (poId, upc, { receivedQty, photo, reason, note }) =>
          patchLine(poId, upc, { status: "EXCEPTION", receivedQty, photo, exception: { reason, note, raisedAt: now(), resolution: null } }),
        resolveException: (poId, upc, note) =>
          set((s) => {
            const line = s.progress[poId]?.results[upc];
            if (!line?.exception) return s;
            const next: LineResult = { ...line, exception: { ...line.exception, resolution: { note, resolvedAt: now() } } };
            return { progress: { ...s.progress, [poId]: { ...s.progress[poId], results: { ...s.progress[poId].results, [upc]: next } } } };
          }),
        completePo: (poId) => patchPo(poId, (p) => ({ ...p, status: "COMPLETE", completedAt: now() })),
        resetDemo: () => set({ pos: [], progress: {}, selected: [] }),
      };
    },
    { name: "dc-qc-demo", version: 1 },
  ),
);

export const lineStatus = (progress: PoProgress | undefined, upc: string) => progress?.results[upc]?.status ?? "PENDING";
