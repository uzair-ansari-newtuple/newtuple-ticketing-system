"use client";

import { AlertTriangle, Camera, CheckCircle2, ImagePlus, Loader2, Minus, Plus, RotateCcw } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { CameraSheet } from "@/components/camera-sheet";
import { LineStatusBadge } from "@/components/qc-badges";
import { QueryError } from "@/components/query-error";
import { SafeImg } from "@/components/safe-img";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { productImageUrl } from "@/data/catalog";
import { makeThumb } from "@/lib/image";
import { matchCount, suggestedReason } from "@/lib/qc/match";
import { useQcLine, useQcMutations, useQcPo } from "@/lib/qc/queries";
import { EXCEPTION_REASONS, type ExceptionReason } from "@/lib/qc/types";

const MATCH_UI = {
  MATCH: { text: "Counts match", tone: "bg-success/12 text-success", Icon: CheckCircle2 },
  SHORT: { text: "Short", tone: "bg-destructive/10 text-destructive", Icon: AlertTriangle },
  OVER: { text: "Over", tone: "bg-warning/18 text-warning-foreground", Icon: AlertTriangle },
} as const;

export default function VerifyUpcPage() {
  const { id, lineId } = useParams<{ id: string; lineId: string }>();
  const router = useRouter();
  const { data: line, isLoading, isError, error, refetch } = useQcLine(lineId);
  const { data: po } = useQcPo(id);
  const { count, exception, recount } = useQcMutations();
  const fileRef = useRef<HTMLInputElement>(null);

  const [qty, setQty] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [raising, setRaising] = useState(false);
  const [reason, setReason] = useState<ExceptionReason | null>(null);
  const [note, setNote] = useState("");

  const back = `/qc/po/${id}`;
  if (isLoading) {
    return (
      <AppShell title="UPC" back={back} area="qc">
        <Skeleton className="h-28 w-full rounded-2xl" />
      </AppShell>
    );
  }
  if (isError || !line) {
    return (
      <AppShell title="UPC" back={back} area="qc">
        <QueryError error={error ?? new Error("UPC not found")} onRetry={refetch} />
      </AppShell>
    );
  }

  const editable = line.po_state === "QC_IN_PROGRESS" && (line.state === "PENDING" || line.state === "COUNT_MISMATCH");
  const entered = qty.trim() === "" ? (line.state === "COUNT_MISMATCH" ? line.received_qty : null) : Math.max(0, Math.floor(Number(qty)) || 0);
  const match = entered === null ? null : matchCount(line.expected_qty, entered);
  const ui = match ? MATCH_UI[match.kind] : null;
  const shownPhoto = photo ?? null;
  const busy = count.isPending || exception.isPending || recount.isPending;
  const chosenReason = reason ?? (match ? suggestedReason(match) : null);

  const step = (delta: number) => setQty(String(Math.max(0, (entered ?? 0) + delta)));

  async function takePhoto(blob: Blob) {
    setPhoto(await makeThumb(blob, 640));
    setCameraOpen(false);
  }

  function leave() {
    const next = po?.lines.find((l) => l.id !== lineId && l.state === "PENDING");
    router.replace(next ? `/qc/po/${id}/line/${next.id}` : back);
  }

  const fail = (e: Error) => toast.error(e.message);

  function verify() {
    if (entered === null || !photo) return;
    count.mutate(
      { id: lineId, received_qty: entered, photo },
      {
        onSuccess: (res) => {
          if (res.state === "VERIFIED") {
            toast.success(`${res.name} verified`);
            leave();
          } else {
            toast.warning("The State Machine says the count does not match the PO");
            setQty("");
            setPhoto(null);
          }
        },
        onError: fail,
      },
    );
  }

  function submitException() {
    if (!chosenReason) return;
    exception.mutate(
      { id: lineId, received_qty: entered ?? undefined, reason: chosenReason, note: note.trim(), photo },
      { onSuccess: () => { toast.success("Exception raised"); leave(); }, onError: fail },
    );
  }

  return (
    <AppShell title={line.name} subtitle={`${line.po_number} · ${line.pallet}`} back={back} area="qc">
      <div className="flex items-center gap-4 rounded-2xl border bg-card p-3 shadow-sm">
        <SafeImg src={productImageUrl(line.sku)} className="size-20 shrink-0 rounded-xl" />
        <dl className="min-w-0 text-sm">
          <dt className="text-xs text-muted-foreground">UPC / GTIN</dt>
          <dd className="font-mono font-medium">{line.upc}</dd>
          <dt className="mt-2 text-xs text-muted-foreground">Expected on the PO</dt>
          <dd className="flex items-center gap-2 text-lg font-bold">{line.expected_qty} units <LineStatusBadge state={line.state} /></dd>
        </dl>
      </div>

      {!editable ? (
        <section className="mt-5 space-y-3">
          {line.received_qty !== null ? <p className="text-sm">Counted <strong>{line.received_qty}</strong> of {line.expected_qty}{line.count_result && line.count_result !== "match" ? ` · ${line.count_result} by ${line.count_diff}` : ""}</p> : null}
          {line.exception ? (
            <div className="rounded-xl border bg-card p-3 text-sm">
              <p className="font-semibold">{EXCEPTION_REASONS[line.exception.reason]}</p>
              {line.exception.note ? <p className="mt-1 text-muted-foreground">{line.exception.note}</p> : null}
              {line.exception.resolution ? <p className="mt-2 rounded-lg bg-success/12 p-2 text-success">Resolved: {line.exception.resolution.note}</p> : null}
            </div>
          ) : null}
          {line.photos.length ? (
            <div className="grid grid-cols-2 gap-2">
              {line.photos.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt={`Goods ${i + 1}`} className="aspect-[4/3] w-full rounded-xl border object-cover" />
              ))}
            </div>
          ) : null}
          {line.po_state !== "QC_IN_PROGRESS" && line.state === "PENDING" ? <p className="text-sm text-muted-foreground">{line.po_state === "FETCHED" ? "Start QC on the purchase order to check this UPC." : "QC on this purchase order is finished."}</p> : null}
        </section>
      ) : (
        <>
          <section className="mt-5">
            <h2 className="mb-2 text-sm font-semibold">Photo of the goods</h2>
            {shownPhoto ? (
              <div className="relative overflow-hidden rounded-2xl border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shownPhoto} alt="Goods received" className="aspect-[4/3] w-full object-cover" />
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
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
                className="h-12 min-w-0 flex-1 rounded-xl border bg-card text-center text-2xl font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <Button variant="outline" size="icon" className="size-12" aria-label="One more" onClick={() => step(1)}><Plus /></Button>
            </div>
            <div aria-live="polite" className={`mt-3 flex items-center gap-3 rounded-xl p-3 text-sm font-medium ${ui ? ui.tone : "bg-muted text-muted-foreground"}`}>
              {ui && match ? <ui.Icon size={18} className="shrink-0" /> : null}
              <span className="flex-1">
                {match && ui ? (match.kind === "MATCH" ? `${ui.text}: ${entered} of ${line.expected_qty}` : `${ui.text} by ${match.diff}: ${entered} of ${line.expected_qty}`) : "Enter the count to compare it with the PO"}
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
                <Button variant="outline" onClick={() => setRaising(false)} disabled={busy}>Cancel</Button>
                <Button variant="destructive" disabled={entered === null || !chosenReason || busy} onClick={submitException}>{exception.isPending ? <Loader2 className="animate-spin" /> : null} Submit exception</Button>
              </div>
            </section>
          ) : (
            <div className="mt-5 space-y-2">
              {line.state === "COUNT_MISMATCH" ? (
                <Button size="lg" variant="outline" className="h-12 w-full" disabled={busy} onClick={() => recount.mutate(lineId, { onSuccess: () => { setQty(""); setPhoto(null); }, onError: fail })}>
                  {recount.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Recount
                </Button>
              ) : (
                <>
                  <Button size="lg" className="h-12 w-full text-base" disabled={!(match?.kind === "MATCH" && photo) || busy} onClick={verify}>
                    {count.isPending ? <><Loader2 className="animate-spin" /> Checking with the State Machine</> : "Verify UPC"}
                  </Button>
                  {match && match.kind !== "MATCH" ? <p className="text-center text-xs text-muted-foreground">The counts do not match, so raise an exception instead.</p> : null}
                  {match?.kind === "MATCH" && !photo ? <p className="text-center text-xs text-muted-foreground">Take a photo of the goods to verify.</p> : null}
                </>
              )}
              <Button variant="outline" size="lg" className="h-12 w-full" disabled={(entered === null && line.state === "PENDING") || busy} onClick={() => setRaising(true)}><AlertTriangle /> Raise exception</Button>
            </div>
          )}
        </>
      )}

      {cameraOpen ? <CameraSheet onCapture={takePhoto} onClose={() => setCameraOpen(false)} /> : null}
    </AppShell>
  );
}
