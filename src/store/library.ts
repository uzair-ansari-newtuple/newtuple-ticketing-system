import { create } from "zustand";
import { api } from "@/lib/api";
import type { LibraryEntry, NormalizedMetadata } from "@/lib/types";
import { useSession } from "@/store/session";

interface LibraryState {
  items: LibraryEntry[];
  catalogCount: number;
  loaded: boolean;
  refresh: () => Promise<void>;
  add: (input: { metadata: NormalizedMetadata; thumb: string; embeddings: number[][] }) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const token = () => useSession.getState().token;

export const useLibrary = create<LibraryState>()((set, get) => ({
  items: [],
  catalogCount: 0,
  loaded: false,
  refresh: async () => {
    const t = token();
    if (!t) return;
    const { items, catalog_count } = await api.listLibrary(t);
    set({ items, catalogCount: catalog_count, loaded: true });
  },
  add: async (input) => {
    const t = token();
    if (!t) return;
    await api.addReference(t, input);
    await get().refresh();
  },
  remove: async (id) => {
    const t = token();
    if (!t) return;
    await api.removeReference(t, id);
    await get().refresh();
  },
}));
