"use client";

import { X } from "lucide-react";
import { SAMPLE_PHOTOS } from "@/data/sample-photos";

export function SamplePhotosSheet({ onPick, onClose }: { onPick: (blob: Blob) => void; onClose: () => void }) {
  async function pick(name: string) {
    const res = await fetch(`/sample-photos/${name}.jpg`);
    onPick(await res.blob());
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-label="Choose a sample photo" onClick={onClose}>
      <div className="flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-t-3xl bg-card sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h3 className="text-base font-bold">Choose a sample photo</h3>
            <p className="text-xs text-muted-foreground">For testing without a camera. Tap a photo to use it.</p>
          </div>
          <button aria-label="Close" onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-muted"><X size={18} /></button>
        </div>
        <div className="grid min-h-0 grid-cols-3 content-start gap-2 overflow-y-auto px-4 pb-4 sm:grid-cols-4">
          {SAMPLE_PHOTOS.map((n) => (
            <button key={n} onClick={() => pick(n)} className="block aspect-square h-auto w-full overflow-hidden rounded-xl border p-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/sample-photos/${n}.jpg`} alt={n.replace(/-/g, " ")} loading="lazy" className="size-full object-cover" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
