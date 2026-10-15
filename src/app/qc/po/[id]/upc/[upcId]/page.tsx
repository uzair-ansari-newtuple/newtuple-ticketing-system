"use client";

import { AlertTriangle, Camera, CheckCircle2, ImagePlus, Loader2, RotateCcw } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { CameraSheet } from "@/components/camera-sheet";
import { PalletCard } from "@/components/qc-pallet-card";
import { UpcBadge } from "@/components/qc-badges";
import { QueryError } from "@/components/query-error";
import { SafeImg } from "@/components/safe-img";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { productImageUrl } from "@/data/catalog";
import { makeThumb } from "@/lib/image";
import { FLAG_REASONS, type FlagReason } from "@/lib/qc/dto";
import { suggestedReason } from "@/lib/qc/match";
import { useQcMutations, useShipment, useUpc } from "@/lib/qc/queries";

export default function UpcPage() {
  const { id, upcId } = useParams<{ id: string; upcId: string }>();
  const router = useRouter();
  const { data: upc, isLoading, isError, error, refetch } = useUpc(upcId);
  const { data: shipment } = useShipment(id);
  const { photo, approve, flag, reopen } = useQcMutations();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [reason, setReason] = useState<FlagReason | null>(null);
  const [note, setNote] = useState("");
  const [reopening, setReopening] = useState(false);
  const [rework, setRework] = useState("");

  const back = `/qc/po/${id}`;
  if (isLoading) return <AppShell title="UPC" back={back} area="qc"><Skeleton className="h-28 w-full rounded-2xl" /></AppShell>;
  if (isError || !upc) return <AppShell title="UPC" back={back} area="qc"><QueryError error={error ?? new Error("UPC not found")} onRetry={refetch} /></AppShell>;

  const working = upc.shipment_state === "IN_PROGRESS" && (upc.state === "PENDING" || upc.state === "IN_PROGRESS");
  const fail = (e: Error) => toast.error(e.message);
  const chosen = reason ?? (upc.count ? suggestedReason(upc.count.result) : "OTHER");
  const allCounted = upc.pallets.length > 0 && upc.pallets.every((p) => p.status === "COMPLETE");

  async function addPhoto(blob: Blob) {
    setCameraOpen(false);
    photo.mutate({ id: upcId, photo: await makeThumb(blob, 640) }, { onSuccess: () => toast.success("Photo saved"), onError: fail });
  }

  function leave() {
    const next = shipment?.upcs.find((u) => u.id !== upcId && (u.state === "PENDING" || u.state === "IN_PROGRESS"));
    router.replace(next ? `/qc/po/${id}/upc/${next.id}` : back);
  }

  const hint = !allCounted ? "Finish the checks and counts on every pallet" : upc.count && upc.count.result !== "MATCH" ? `The count is ${upc.count.result === "SHORT" ? "short" : "over"} by ${upc.count.diff}. Flag it for the supervisor.` : upc.photo_count < 1 ? "Take a photo of the goods" : "";

  return (
    <AppShell title={upc.description} subtitle={`${upc.po_number} · ${upc.style_number}`} back={back} area="qc">
      <div className="flex items-center gap-4 rounded-2xl border bg-card p-3 shadow-sm">
        <SafeImg src={productImageUrl(upc.upc_code)} className="size-20 shrink-0 rounded-xl" />
        <dl className="min-w-0 text-sm">
          <dt className="text-xs text-muted-foreground">UPC / GTIN</dt>
          <dd className="font-mono font-medium">{upc.upc_code}</dd>
          <dt className="mt-2 text-xs text-muted-foreground">Expected on the PO</dt>
          <dd className="flex items-center gap-2 text-lg font-bold">{upc.expected_units} units <UpcBadge state={upc.state} /></dd>
          <dd className="text-xs text-muted-foreground">{upc.color_name} · {upc.size_label} · ${upc.retail_price} · {upc.shipped_cases} cases of {upc.mdl}</dd>
        </dl>
      </div>

      {upc.flag ? (
        <section className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-destructive"><AlertTriangle size={16} /> {FLAG_REASONS[upc.flag.reason]}</p>
          {upc.flag.note ? <p className="mt-1">{upc.flag.note}</p> : null}
          <p className="mt-2 text-muted-foreground">{upc.state === "SUPERVISOR_HOLD" ? "Waiting for a supervisor. You can answer it on the Exceptions tab." : upc.flag.resolution_note ? `Supervisor: ${upc.flag.resolution_note}` : "The supervisor answered this flag."}</p>
        </section>
      ) : null}
      {upc.rework_reason && upc.state === "IN_PROGRESS" ? <p className="mt-4 rounded-xl bg-warning/18 p-3 text-sm">Sent back for rework: {upc.rework_reason}</p> : null}

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Photos of the goods</h2>
          <span className="text-xs text-muted-foreground">{upc.photos.length} saved</span>
        </div>
        {upc.photos.length ? (
          <div className="mb-2 grid grid-cols-2 gap-2">
            {upc.photos.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt={`Goods ${i + 1}`} className="aspect-[4/3] w-full rounded-xl border object-cover" />
            ))}
          </div>
        ) : null}
        {working ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant={upc.photos.length ? "outline" : "default"} size="lg" className="h-12" disabled={photo.isPending} onClick={() => setCameraOpen(true)}>{photo.isPending ? <Loader2 className="animate-spin" /> : <Camera />} Take photo</Button>
            <Button variant="outline" size="lg" className="h-12" disabled={photo.isPending} onClick={() => fileRef.current?.click()}><ImagePlus /> Upload</Button>
          </div>
        ) : null}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) await addPhoto(file);
        }} />
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-sm font-semibold">Pallets</h2>
        {upc.pallets.map((p) => <PalletCard key={`${p.id}:${p.status}:${p.total_units}`} upc={upc} pallet={p} editable={working} />)}
      </section>

      {allCounted ? (
        <div className={`mt-4 flex items-center gap-2 rounded-xl p-3 text-sm font-medium ${upc.count?.result === "MATCH" ? "bg-success/12 text-success" : "bg-destructive/10 text-destructive"}`}>
          {upc.count?.result === "MATCH" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          {upc.count?.result === "MATCH" ? `All pallets add up: ${upc.received_units} of ${upc.expected_units}` : `${upc.received_units} of ${upc.expected_units} (${upc.count?.result === "SHORT" ? "short" : "over"} by ${upc.count?.diff})`}
        </div>
      ) : null}

      {working ? (
        flagging ? (
          <section className="mt-5 rounded-2xl border bg-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold">Flag for the supervisor</h2>
            <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Reason">
              {(Object.keys(FLAG_REASONS) as FlagReason[]).map((key) => (
                <button key={key} role="radio" aria-checked={chosen === key} onClick={() => setReason(key)} className={`rounded-full border px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${chosen === key ? "border-transparent bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}>{FLAG_REASONS[key]}</button>
              ))}
            </div>
            <Textarea className="mt-3" rows={3} placeholder="Add a note for the supervisor (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setFlagging(false)} disabled={flag.isPending}>Cancel</Button>
              <Button variant="destructive" disabled={flag.isPending} onClick={() => flag.mutate({ id: upcId, reason: chosen, note: note.trim() }, { onSuccess: () => { toast.success("Flagged for the supervisor"); leave(); }, onError: fail })}>{flag.isPending ? <Loader2 className="animate-spin" /> : null} Submit flag</Button>
            </div>
          </section>
        ) : (
          <div className="mt-5 space-y-2">
            <Button size="lg" className="h-12 w-full text-base" disabled={Boolean(hint) || approve.isPending} onClick={() => approve.mutate(upcId, { onSuccess: () => { toast.success(`${upc.description} approved`); leave(); }, onError: fail })}>
              {approve.isPending ? <Loader2 className="animate-spin" /> : null} Approve UPC
            </Button>
            {hint ? <p className="text-center text-xs text-muted-foreground">{hint}</p> : null}
            <Button variant="outline" size="lg" className="h-12 w-full" onClick={() => setFlagging(true)}><AlertTriangle /> Flag UPC</Button>
          </div>
        )
      ) : null}

      {upc.shipment_state === "IN_PROGRESS" && upc.state === "APPROVED" ? (
        reopening ? (
          <section className="mt-5 rounded-2xl border bg-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold">Send back for rework</h2>
            <Textarea className="mt-3" rows={2} placeholder="What needs to be redone?" value={rework} onChange={(e) => setRework(e.target.value)} />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setReopening(false)}>Cancel</Button>
              <Button disabled={!rework.trim() || reopen.isPending} onClick={() => reopen.mutate({ id: upcId, reason: rework.trim() }, { onSuccess: () => { setReopening(false); toast.success("Sent back for rework"); }, onError: fail })}>{reopen.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reopen</Button>
            </div>
          </section>
        ) : (
          <Button variant="outline" size="lg" className="mt-5 h-12 w-full" onClick={() => setReopening(true)}><RotateCcw /> Reopen for rework</Button>
        )
      ) : null}

      {cameraOpen ? <CameraSheet onCapture={addPhoto} onClose={() => setCameraOpen(false)} /> : null}
    </AppShell>
  );
}
