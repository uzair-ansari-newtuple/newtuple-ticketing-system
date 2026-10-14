"use client";

import { Camera, Check, ImagePlus, Image as ImageIcon, MapPin, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { CameraSheet } from "@/components/camera-sheet";
import { MetadataCard } from "@/components/metadata-card";
import { EASE, Stagger, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { getCurrentPosition, readExif } from "@/lib/exif";
import { processImage } from "@/lib/image";
import { MAX_PHOTOS, SLOTS } from "@/lib/slots";
import type { PhotoSlot } from "@/lib/types";
import { useCapture } from "@/store/capture";

export default function CapturePage() {
  const { photos, setPhoto, removePhoto } = useCapture();
  const fileRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState<PhotoSlot>(() => SLOTS.find((s) => !useCapture.getState().photos.some((p) => p.slot === s.key))?.key ?? "front");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [attachLocation, setAttachLocation] = useState(false);
  const [hideLocation, setHideLocation] = useState(false);
  const [busy, setBusy] = useState(false);

  const activeSlot = SLOTS.find((s) => s.key === active) ?? SLOTS[0];
  const activePhoto = photos.find((p) => p.slot === active);

  function nextEmptySlot(after: PhotoSlot): PhotoSlot {
    const current = useCapture.getState().photos;
    const start = SLOTS.findIndex((s) => s.key === after);
    for (let i = 1; i <= SLOTS.length; i++) {
      const slot = SLOTS[(start + i) % SLOTS.length];
      if (!current.some((p) => p.slot === slot.key)) return slot.key;
    }
    return after;
  }

  async function ingest(file: Blob & { name?: string }, source: "captured" | "uploaded", slot: PhotoSlot) {
    const [processed, exif] = await Promise.all([processImage(file), source === "uploaded" ? readExif(file) : null]);
    if (useCapture.getState().photos.some((p) => p.metadata.sha256 === processed.sha256 && p.slot !== slot)) {
      throw new Error("That photo is already in another slot.");
    }
    const gps = exif?.gps ?? (source === "captured" && attachLocation ? await getCurrentPosition() : null);
    setPhoto({
      id: crypto.randomUUID(),
      slot,
      dataUrl: processed.dataUrl,
      base64: processed.base64,
      metadata: {
        fileName: file.name ?? `capture-${Date.now()}.jpg`,
        source,
        mimeType: file.type,
        originalBytes: file.size,
        compressedBytes: processed.bytes,
        width: processed.width,
        height: processed.height,
        sha256: processed.sha256,
        capturedAt: exif?.capturedAt ?? (source === "captured" ? new Date().toISOString() : null),
        device: exif?.device ?? null,
        orientation: exif?.orientation ?? null,
        gps,
        userAgent: navigator.userAgent,
        blurScore: processed.blurScore,
        brightness: processed.brightness,
      },
    });
    toast.success(`${SLOTS.find((s) => s.key === slot)?.label} photo added`);
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that image. Use a JPEG or PNG photo.");
    } finally {
      setBusy(false);
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    if (fileRef.current) fileRef.current.value = "";
    await run(async () => {
      let slot = active;
      for (let i = 0; i < list.length; i++) {
        await ingest(list[i], "uploaded", slot);
        slot = nextEmptySlot(slot);
        if (i === list.length - 1) setActive(slot);
      }
    });
  }

  const count = photos.length;
  const hasGps = photos.some((p) => p.metadata.gps);

  return (
    <AppShell
      title="Capture photos"
      subtitle="Add at least one photo. More angles give better results."
      back="/"
      footer={
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{count} of {MAX_PHOTOS} photos</p>
            <Progress value={(count / MAX_PHOTOS) * 100} className="mt-1.5" />
          </div>
          <Button render={<Link href="/review" />} nativeButton={false} size="lg" disabled={count === 0} className={count === 0 ? "pointer-events-none opacity-40" : ""}>
            Continue
          </Button>
        </div>
      }
    >
      <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SLOTS.map((slot) => {
          const photo = photos.find((p) => p.slot === slot.key);
          const selected = slot.key === active;
          return (
            <StaggerItem
              key={slot.key}
              whileTap={{ scale: 0.97 }}
              className={`relative aspect-[4/3] overflow-hidden rounded-2xl border-2 transition-[border-color,box-shadow] duration-200 ${selected ? "border-primary ring-4 ring-primary/15" : "border-border"} ${photo ? "" : "border-dashed bg-card"}`}
            >
              <button onClick={() => setActive(slot.key)} aria-label={`Select ${slot.label} slot`} className="absolute inset-0 text-left">
                <AnimatePresence mode="popLayout" initial={false}>
                  {photo ? (
                     
                    <motion.img key={photo.id} src={photo.dataUrl} alt={`${slot.label} photo`} className="absolute inset-0 size-full object-cover" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} />
                  ) : (
                    <motion.span key="empty" className="absolute inset-0 grid place-items-center text-muted-foreground" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <ImageIcon size={26} strokeWidth={1.5} />
                    </motion.span>
                  )}
                </AnimatePresence>
                <span className={`absolute inset-x-0 bottom-0 flex items-center gap-1.5 px-3 pb-2 pt-6 text-xs font-semibold ${photo ? "bg-gradient-to-t from-black/70 to-transparent text-white" : "text-foreground"}`}>
                  {photo ? <Check size={13} className="text-emerald-300" /> : null}
                  {slot.label}
                </span>
              </button>
              <AnimatePresence>
                {photo ? (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    onClick={() => removePhoto(photo.id)}
                    aria-label={`Remove ${slot.label} photo`}
                    className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/55 text-white backdrop-blur"
                  >
                    <Trash2 size={14} />
                  </motion.button>
                ) : null}
              </AnimatePresence>
            </StaggerItem>
          );
        })}
      </Stagger>

      <Card className="mt-4">
        <CardContent>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={active} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }}>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">{activeSlot.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{activeSlot.hint}</p>
            </motion.div>
          </AnimatePresence>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button size="lg" disabled={busy} onClick={() => setCameraOpen(true)}>
              <Camera /> {activePhoto ? "Retake" : "Capture"}
            </Button>
            <Button size="lg" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
              <ImagePlus /> Upload
            </Button>
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/heif" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          <div className="mt-4 flex items-center gap-2.5">
            <Checkbox id="attach-location" checked={attachLocation} onCheckedChange={(v) => setAttachLocation(v === true)} />
            <Label htmlFor="attach-location" className="text-muted-foreground">Attach my location to live captures</Label>
          </div>
          {busy ? <p className="mt-3 text-sm text-muted-foreground">Processing photo…</p> : null}
        </CardContent>
      </Card>

      <AnimatePresence>
        {activePhoto ? (
          <motion.div key="meta" className="mt-6" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease: EASE }}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{activeSlot.label} · photo metadata</h2>
            <MetadataCard m={activePhoto.metadata} showLocation={!hideLocation} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {hasGps ? (
        <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-warning/15 px-3 py-2.5 text-sm">
          <MapPin size={15} className="shrink-0 text-warning" />
          <Checkbox id="hide-location" checked={hideLocation} onCheckedChange={(v) => setHideLocation(v === true)} />
          <Label htmlFor="hide-location">Location found in photos. Hide coordinates on screen.</Label>
        </div>
      ) : null}

      <AnimatePresence>
        {cameraOpen ? (
          <CameraSheet
            onClose={() => setCameraOpen(false)}
            onCapture={(blob) => {
              setCameraOpen(false);
              void run(async () => {
                await ingest(blob, "captured", active);
                setActive(nextEmptySlot(active));
              });
            }}
          />
        ) : null}
      </AnimatePresence>
    </AppShell>
  );
}
