"use client";

import { X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EASE } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { readBarcode } from "@/lib/ml/barcode";

const SCAN_INTERVAL_MS = 250;

export function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    let busy = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera is not available here (it needs HTTPS). Type the barcode instead.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        timer = setInterval(async () => {
          if (busy || cancelled || video.readyState < 2) return;
          busy = true;
          try {
            const code = await readBarcode(video);
            if (code && !cancelled) {
              cancelled = true;
              onDetected(code);
            }
          } catch {
            // A frame that cannot be decoded is expected while the user is still aiming. Try the next one.
          } finally {
            busy = false;
          }
        }, SCAN_INTERVAL_MS);
      } catch {
        setError("Camera permission was denied or no camera was found. Type the barcode instead.");
      }
    }
    void start();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetected]);

  return (
    <motion.div className="fixed inset-0 z-50 flex flex-col bg-black" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }} transition={{ duration: 0.3, ease: EASE }}>
      <Button onClick={onClose} variant="ghost" size="icon" aria-label="Close scanner" className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white">
        <X />
      </Button>
      {error ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-white">{error}</div>
      ) : (
        <div className="relative flex-1">
          <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="relative h-36 w-[78%] max-w-sm rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              <motion.span className="absolute inset-x-3 h-0.5 rounded-full bg-red-400" animate={{ top: ["12%", "88%", "12%"] }} transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }} />
            </div>
          </div>
          <p className="absolute inset-x-0 bottom-[max(2rem,env(safe-area-inset-bottom))] text-center text-sm font-medium text-white">Point the camera at the barcode</p>
        </div>
      )}
    </motion.div>
  );
}
