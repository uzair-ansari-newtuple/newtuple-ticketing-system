"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";

/** Image that falls back to a neutral placeholder when the file is missing or invalid. */
export function SafeImg({ src, className, contain }: { src: string | null | undefined; className?: string; contain?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className={`grid place-items-center bg-muted text-muted-foreground ${className ?? ""}`}>
        <ImageOff size={18} />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={`${contain ? "bg-muted object-contain" : "object-cover"} ${className ?? ""}`} onError={() => setFailed(true)} />;
}
