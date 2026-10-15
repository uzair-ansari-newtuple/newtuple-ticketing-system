import { create } from "zustand";

/** Which purchase orders are ticked on the list. Everything else about QC lives in the State Machine. */
interface QcSelection {
  selected: string[];
  toggle: (poId: string) => void;
  clear: () => void;
}

export const useQcSelection = create<QcSelection>((set) => ({
  selected: [],
  toggle: (poId) => set((s) => ({ selected: s.selected.includes(poId) ? s.selected.filter((id) => id !== poId) : [...s.selected, poId] })),
  clear: () => set({ selected: [] }),
}));
