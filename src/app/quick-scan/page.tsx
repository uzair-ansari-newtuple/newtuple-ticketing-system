"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, ImagePlus, Keyboard, Loader2, ScanBarcode, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { CameraSheet } from "@/components/camera-sheet";
import { Reveal } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { buildCaptureMetadata } from "@/lib/capture";
import { makeThumb, processImage } from "@/lib/image";
import { readBarcode } from "@/lib/ml/barcode";
import { readText } from "@/lib/ml/ocr";
import { isValidGtin, normalizeGtin, parseTagText } from "@/lib/taxonomy";
import type { QuickScanBody } from "@/lib/types";
import { useSession } from "@/store/session";

export default function QuickScanPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const token = useSession((s) => s.token);
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [typing, setTyping] = useState(false);
  const [working, setWorking] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: (body: QuickScanBody) => api.quickScan(token!, body),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ["incidents"] });
      if (r.found) {
        toast.success(`${r.incident_number_display} is ready to print`);
        router.push(`/incident/${r.incident_id}/print`);
      } else {
        toast.error("That barcode is not in the catalog");
        router.push(`/incident/${r.incident_id}`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onBarcode = useCallback(
    (code: string) => {
      setScanning(false);
      submit.mutate({ path: "BARCODE", barcode: code });
    },
    [submit],
  );

  async function onPhoto(file: Blob & { name?: string }, source: "captured" | "uploaded") {
    try {
      setWorking("Preparing the photo");
      const processed = await processImage(file);
      setWorking("Reading the barcode");
      let barcode = await readBarcode(await createImageBitmap(file)).catch(() => null);
      let ocrText: string | undefined;
      if (!barcode) {
        setWorking("Reading the tag text");
        ocrText = (await readText(processed.dataUrl)).text;
        barcode = parseTagText(ocrText).barcode;
      }
      if (!barcode) {
        toast.error("No barcode found. Move closer so the barcode fills the frame, or type it below.");
        return;
      }
      submit.mutate({
        path: "NEARBY_TAG",
        barcode,
        ocr_text: ocrText,
        thumb: await makeThumb(processed.dataUrl),
        image: {
          client_image_id: crypto.randomUUID(),
          slot: "tag",
          capture: await buildCaptureMetadata(file, source, processed),
          mime_type: "image/jpeg",
          image_base64: processed.base64,
          sha256: processed.sha256,
          quality_hint: { blur_score: processed.blurScore, brightness: processed.brightness, width: processed.width, height: processed.height },
        },
      });
    } catch {
      toast.error("Could not read that photo. Use a JPEG or PNG image.");
    } finally {
      setWorking(null);
    }
  }

  function lookUp() {
    const code = normalizeGtin(typed.replace(/\s/g, ""));
    if (!isValidGtin(code)) {
      toast.error("That barcode number is not valid. Check the digits.");
      return;
    }
    submit.mutate({ path: "BARCODE", barcode: code });
  }

  const busy = submit.isPending || working !== null;

  return (
    <AppShell title="Quick scan" subtitle="Find the item by its barcode, then print." back="/">
      <Reveal>
        <button onClick={() => setScanning(true)} disabled={busy} className="flex w-full flex-col items-center gap-4 rounded-3xl bg-primary px-6 py-10 text-primary-foreground shadow-lg shadow-primary/20 transition active:scale-[0.99] disabled:opacity-60">
          <span className="grid size-20 place-items-center rounded-full bg-white/15"><ScanBarcode size={40} /></span>
          <span className="text-xl font-bold">Scan the barcode</span>
          <span className="text-sm opacity-80">Point the camera at the barcode on the item</span>
        </button>
      </Reveal>

      <p className="my-5 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">or</p>

      <div className="grid grid-cols-2 gap-3">
        <Button size="lg" variant="outline" disabled={busy} onClick={() => setCameraOpen(true)}><Camera /> Photo of tag</Button>
        <Button size="lg" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><ImagePlus /> Upload</Button>
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/heif" hidden onChange={(e) => { const f = e.target.files?.[0]; if (fileRef.current) fileRef.current.value = ""; if (f) void onPhoto(f, "uploaded"); }} />

      <button onClick={() => setTyping((t) => !t)} className="mx-auto mt-5 flex items-center gap-1.5 text-sm font-medium text-primary">
        <Keyboard size={16} /> {typing ? "Hide" : "Type the number instead"}
      </button>
      <AnimatePresence initial={false}>
        {typing ? (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <div className="flex gap-2 pt-3">
              <Input aria-label="Barcode number" autoFocus inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookUp()} placeholder="12 or 13 digits" className="h-11" />
              <Button size="lg" disabled={busy || typed.trim().length < 8} onClick={lookUp}><Search /> Look up</Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {busy ? (
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin" size={16} /> {working ?? "Looking up the product"}…</p>
      ) : null}

      <AnimatePresence>
        {scanning ? <BarcodeScanner onDetected={onBarcode} onClose={() => setScanning(false)} /> : null}
        {cameraOpen ? (
          <CameraSheet
            onClose={() => setCameraOpen(false)}
            onCapture={(blob) => {
              setCameraOpen(false);
              void onPhoto(blob, "captured");
            }}
          />
        ) : null}
      </AnimatePresence>
    </AppShell>
  );
}
