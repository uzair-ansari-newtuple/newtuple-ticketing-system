import { create } from "zustand";

/** Which shipments are ticked on the list. Everything else about QC lives in the State Machine. */
interface QcSelection {
  selected: string[];
  toggle: (id: string) => void;
  clear: () => void;
}

export const useQcSelection = create<QcSelection>((set) => ({
  selected: [],
  toggle: (id) => set((s) => ({ selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id] })),
  clear: () => set({ selected: [] }),
}));
