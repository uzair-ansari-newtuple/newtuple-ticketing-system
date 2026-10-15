"use client";

import { AlertTriangle, Camera, CheckCircle2, ImagePlus, Minus, Plus, RotateCcw } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { CameraSheet } from "@/components/camera-sheet";
import { SafeImg } from "@/components/safe-img";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { productImageUrl } from "@/data/catalog";
import { makeThumb } from "@/lib/image";
import { matchCount, suggestedReason } from "@/lib/qc/match";
import { EXCEPTION_REASONS, type ExceptionReason } from "@/lib/qc/types";
import { useQc } from "@/store/qc";

const MATCH_UI = {
  MATCH: { text: "Counts match", tone: "bg-success/12 text-success", Icon: CheckCircle2 },
  SHORT: { text: "Short", tone: "bg-destructive/10 text-destructive", Icon: AlertTriangle },
  OVER: { text: "Over", tone: "bg-warning/18 text-warning-foreground", Icon: AlertTriangle },
} as const;

export default function VerifyUpcPage() {
  const { id, upc } = useParams<{ id: string; upc: string }>();
  const router = useRouter();
  const po = useQc((s) => s.pos.find((p) => p.id === id));
  const existing = useQc((s) => s.progress[id]?.results[upc]);
  const verifyLine = useQc((s) => s.verifyLine);
  const raiseException = useQc((s) => s.raiseException);
  const fileRef = useRef<HTMLInputElement>(null);

  const line = po?.lines.find((l) => l.upc === upc);
  const [count, setCount] = useState(existing ? String(existing.receivedQty) : "");
  const [photo, setPhoto] = useState<string | null>(existing?.photo ?? null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [raising, setRaising] = useState(existing?.status === "EXCEPTION");
  const [reason, setReason] = useState<ExceptionReason | null>(existing?.exception?.reason ?? null);
  const [note, setNote] = useState(existing?.exception?.note ?? "");

  if (!po || !line) {
    return (
      <AppShell title="UPC" back={`/qc/po/${id}`} area="qc">
        <p className="mt-10 text-center text-sm text-muted-foreground">This UPC is not on this purchase order.</p>
      </AppShell>
    );
  }

  const entered = count.trim() === "" ? null : Math.max(0, Math.floor(Number(count)) || 0);
  const match = entered === null ? null : matchCount(line.expectedQty, entered);
  const ui = match ? MATCH_UI[match.kind] : null;
  const canVerify = match?.kind === "MATCH" && photo !== null;
  const chosenReason = reason ?? (match ? suggestedReason(match) : null);

  const step = (delta: number) => setCount(String(Math.max(0, (entered ?? 0) + delta)));

  async function takePhoto(blob: Blob) {
    setPhoto(await makeThumb(blob, 640));
    setCameraOpen(false);
  }

  function nextPending() {
    const results = useQc.getState().progress[id]?.results ?? {};
    return po?.lines.find((l) => l.upc !== upc && !results[l.upc]);
  }

  function leave() {
    const next = nextPending();
    router.replace(next ? `/qc/po/${id}/upc/${next.upc}` : `/qc/po/${id}`);
  }

  function verify() {
    if (entered === null || !photo) return;
    verifyLine(id, upc, { receivedQty: entered, photo });
    toast.success(`${line!.name} verified`);
    leave();
  }

  function submitException() {
    if (entered === null || !chosenReason) return;
    raiseException(id, upc, { receivedQty: entered, photo, reason: chosenReason, note: note.trim() });
    toast.success("Exception raised");
    leave();
  }

  return (
    <AppShell title={line.name} subtitle={`${po.number} · ${line.palletId}`} back={`/qc/po/${id}`} area="qc">
      <div className="flex items-center gap-4 rounded-2xl border bg-card p-3 shadow-sm">
        <SafeImg src={productImageUrl(line.sku)} className="size-20 shrink-0 rounded-xl" />
        <dl className="text-sm">
          <dt className="text-xs text-muted-foreground">UPC / GTIN</dt>
          <dd className="font-mono font-medium">{line.upc}</dd>
          <dt className="mt-2 text-xs text-muted-foreground">Expected on the PO</dt>
          <dd className="text-lg font-bold">{line.expectedQty} units</dd>
        </dl>
      </div>

      <section className="mt-5">
        <h2 className="mb-2 text-sm font-semibold">Photo of the goods</h2>
        {photo ? (
          <div className="relative overflow-hidden rounded-2xl border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="Goods received" className="aspect-[4/3] w-full object-cover" />
            <Button size="sm" variant="secondary" className="absolute bottom-2 right-2" onClick={() => setPhoto(null)}><RotateCcw /> Retake</Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" className="h-14" onClick={() => setCameraOpen(true)}><Camera /> Take photo</Button>
            <Button size="lg" variant="outline" className="h-14" onClick={() => fileRef.current?.click()}><ImagePlus /> Upload</Button>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) await takePhoto(file);
        }} />
      </section>

      <section className="mt-5">
        <h2 className="mb-2 text-sm font-semibold">Count received</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="size-12" aria-label="One fewer" onClick={() => step(-1)}><Minus /></Button>
          <input
            inputMode="numeric"
            aria-label="Units received"
            placeholder="0"
            value={count}
            onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))}
            className="h-12 min-w-0 flex-1 rounded-xl border bg-card text-center text-2xl font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <Button variant="outline" size="icon" className="size-12" aria-label="One more" onClick={() => step(1)}><Plus /></Button>
        </div>

        <div aria-live="polite" className={`mt-3 flex items-center gap-3 rounded-xl p-3 text-sm font-medium ${ui ? ui.tone : "bg-muted text-muted-foreground"}`}>
          {ui && match ? <ui.Icon size={18} className="shrink-0" /> : null}
          <span className="flex-1">
            {match && ui ? (match.kind === "MATCH" ? `${ui.text}: ${entered} of ${line.expectedQty}` : `${ui.text} by ${match.diff}: ${entered} of ${line.expectedQty}`) : "Enter the count to compare it with the PO"}
          </span>
        </div>
      </section>

      {raising ? (
        <section className="mt-5 rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Raise an exception</h2>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Reason">
            {(Object.keys(EXCEPTION_REASONS) as ExceptionReason[]).map((key) => (
              <button
                key={key}
                role="radio"
                aria-checked={chosenReason === key}
                onClick={() => setReason(key)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${chosenReason === key ? "border-transparent bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}
              >
                {EXCEPTION_REASONS[key]}
              </button>
            ))}
          </div>
          <Textarea className="mt-3" rows={3} placeholder="Add a note for the supervisor (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setRaising(false)}>Cancel</Button>
            <Button variant="destructive" disabled={entered === null || !chosenReason} onClick={submitException}>Submit exception</Button>
          </div>
        </section>
      ) : (
        <div className="mt-5 space-y-2">
          <Button size="lg" className="h-12 w-full text-base" disabled={!canVerify} onClick={verify}>Verify UPC</Button>
          {match && match.kind !== "MATCH" ? <p className="text-center text-xs text-muted-foreground">The counts do not match, so raise an exception instead.</p> : null}
          {match?.kind === "MATCH" && !photo ? <p className="text-center text-xs text-muted-foreground">Take a photo of the goods to verify.</p> : null}
          <Button variant="outline" size="lg" className="h-12 w-full" disabled={entered === null} onClick={() => setRaising(true)}><AlertTriangle /> Raise exception</Button>
        </div>
      )}

      {cameraOpen ? <CameraSheet onCapture={takePhoto} onClose={() => setCameraOpen(false)} /> : null}
    </AppShell>
  );
}
