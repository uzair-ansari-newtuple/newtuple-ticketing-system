"use client";

import { X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EASE } from "@/components/motion";
import { Button } from "@/components/ui/button";

export function CameraSheet({ onCapture, onClose }: { onCapture: (blob: Blob) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera is not available here (it needs HTTPS). Use Upload instead.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError("Camera permission was denied or no camera was found. Use Upload instead.");
      }
    }
    start();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function shoot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => blob && onCapture(blob), "image/jpeg", 0.92);
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      <Button onClick={onClose} variant="ghost" size="icon" aria-label="Close camera" className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white">
        <X />
      </Button>
      {error ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-white">{error}</div>
      ) : (
        <>
          <video ref={videoRef} playsInline muted className="min-h-0 flex-1 object-cover" />
          <div className="flex justify-center bg-black py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <motion.button whileTap={{ scale: 0.9 }} onClick={shoot} aria-label="Take photo" className="size-[72px] rounded-full border-4 border-white bg-white/25" />
          </div>
        </>
      )}
    </motion.div>
  );
}
