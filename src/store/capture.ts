import { create } from "zustand";
import type { CaptureMetadata, PhotoSlot } from "@/lib/types";

export interface CapturedPhoto {
  id: string;
  slot: PhotoSlot;
  dataUrl: string;
  base64: string;
  metadata: CaptureMetadata;
}

interface CaptureState {
  photos: CapturedPhoto[];
  setPhoto: (photo: CapturedPhoto) => void;
  removePhoto: (id: string) => void;
  reset: () => void;
}

export const useCapture = create<CaptureState>((set) => ({
  photos: [],
  setPhoto: (photo) => set((s) => ({ photos: [...s.photos.filter((p) => p.slot !== photo.slot), photo] })),
  removePhoto: (id) => set((s) => ({ photos: s.photos.filter((p) => p.id !== id) })),
  reset: () => set({ photos: [] }),
}));
