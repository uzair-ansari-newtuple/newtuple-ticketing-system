"use client";

import { Camera, Clock, Cpu, Fingerprint, HardDrive, MapPin, Ruler, Sun } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { CaptureMetadata } from "@/lib/types";

function Item({ icon: Icon, label, value, mono }: { icon: React.ElementType; label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <StaggerItem className="flex items-start gap-3 rounded-xl bg-muted/70 p-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className={`mt-0.5 break-words text-sm font-semibold ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
      </div>
    </StaggerItem>
  );
}

export function MetadataCard({ m, showLocation = true }: { m: CaptureMetadata; showLocation?: boolean }) {
  const location = m.gps ? (showLocation ? `${m.gps.lat.toFixed(5)}, ${m.gps.lng.toFixed(5)}` : "Hidden") : "Not recorded";
  return (
    <Stagger key={m.sha256} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Item icon={Camera} label="Source" value={m.source === "captured" ? "Live camera" : "Uploaded file"} />
      <Item icon={Clock} label="Captured" value={formatDateTime(m.capturedAt)} />
      <Item icon={Cpu} label="Device" value={m.device ?? "Not in EXIF"} />
      <Item icon={Ruler} label="Dimensions" value={`${m.width} × ${m.height} px`} />
      <Item icon={HardDrive} label="File size" value={`${formatBytes(m.originalBytes)} → ${formatBytes(m.compressedBytes)}`} />
      <Item icon={MapPin} label="Location" value={location} />
      <Item icon={Sun} label="Sharpness · Brightness" value={`${m.blurScore.toFixed(0)} · ${m.brightness}/255`} />
      <Item icon={Fingerprint} label="SHA-256" value={`${m.sha256.slice(0, 20)}…`} mono />
    </Stagger>
  );
}
