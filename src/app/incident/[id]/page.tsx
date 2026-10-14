"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BookmarkPlus, CheckCircle2, CircleHelp, Clock, HelpCircle, Loader2, Plus, ShieldAlert, Tag, Trash2, Truck, HandHeart } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Barcode } from "@/components/barcode";
import { SourceBadge } from "@/components/field-source";
import { MetadataCard } from "@/components/metadata-card";
import { ConfidenceRing, EASE } from "@/components/motion";
import { PrintPanel } from "@/components/print-panel";
import { SafeImg } from "@/components/safe-img";
import { TicketSkeleton } from "@/components/skeletons";
import { GatingBadge, PriorityBadge, REASONS, StateBadge, dispositionLabel } from "@/components/status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { timeAgo } from "@/lib/inbox";
import { useIncident, useIncidentImages } from "@/lib/queries";
import { SLOTS } from "@/lib/slots";
import type { Candidate, Disposition, IncidentDetail, NormalizedMetadata } from "@/lib/types";
import { useLibrary } from "@/store/library";
import { useSession } from "@/store/session";

const DETAILS: { label: string; keys: (keyof NormalizedMetadata)[] }[] = [
  { label: "Brand", keys: ["Brand"] },
  { label: "Department", keys: ["DepartmentName"] },
  { label: "Product type", keys: ["ProductName"] },
  { label: "Class", keys: ["ClassName"] },
  { label: "Color", keys: ["ColorName"] },
  { label: "Size", keys: ["SizeCode"] },
  { label: "Barcode / GTIN", keys: ["Barcode"] },
  { label: "Book retail", keys: ["Price"] },
  { label: "SKU", keys: ["Sku"] },
  { label: "Dept code", keys: ["DepartmentCode"] },
  { label: "Class code", keys: ["ClassCode"] },
  { label: "Color code", keys: ["ColorCode"] },
  { label: "Size code", keys: ["SizeCode"] },
];

const EVIDENCE: Record<Candidate["evidence"], string> = { barcode: "Barcode match", image: "Looks the same", attributes: "Brand and type match" };
const BLOCKED_COPY: Record<string, string> = {
  TOO_MANY_CANDIDATES: "Too many items look similar, so we can't pick one safely.",
  LOW_EVIDENCE: "We couldn't find a close enough match for this item.",
  CATALOG_UNAVAILABLE: "The image analysis could not run for this ticket.",
};
const DISPOSITIONS: { key: Disposition; label: string; icon: React.ElementType }[] = [
  { key: "DISCARD", label: "Discard", icon: Trash2 },
  { key: "RETURN_TO_VENDOR", label: "Return to Vendor", icon: Truck },
  { key: "DONATE", label: "Donate", icon: HandHeart },
];

function CandidateCard({ c, selected, onSelect }: { c: Candidate; selected: boolean; onSelect: () => void }) {
  const m = c.metadata;
  return (
    <button onClick={onSelect} aria-pressed={selected} className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition ${selected ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
      <SafeImg src={c.thumb} className="size-14 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{m.ProductName ?? `${m.Brand ?? "Item"} · ${m.ClassName ?? ""}`}</p>
        <p className="truncate text-sm text-muted-foreground">{[m.Brand, m.ColorName, m.Price].filter(Boolean).join(" · ")}</p>
        <p className="text-xs text-muted-foreground">{EVIDENCE[c.evidence]}</p>
      </div>
      <span className="text-lg font-bold text-primary">{Math.round(c.score * 100)}%</span>
    </button>
  );
}

function SimilarItem({ c, onResolve, busy, assistHref }: { c: Candidate; onResolve: () => void; busy: boolean; assistHref: string }) {
  const m = c.metadata;
  const rows: [string, string | null][] = [["Class", m.ClassName], ["Color", m.ColorName], ["Size", m.SizeCode], ["Barcode / GTIN", m.Barcode], ["Book retail", m.Price]];
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl bg-slate-950 text-white">
        <p className="px-4 pt-3 text-sm font-semibold">Similar item found</p>
        <SafeImg src={c.thumb} className="mt-2 aspect-[4/3] w-full" />
        <p className="px-4 py-2 text-xs text-white/70">Matched photo</p>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Matched item found</p>
        <h2 className="text-xl font-bold">{m.ProductName ?? "Similar item found"}</h2>
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-success/12 px-3 py-1 text-sm font-semibold text-success"><span className="size-2 rounded-full bg-success" /> {Math.round(c.score * 100)}% match</span>
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-2xl border bg-card p-4">
        <p className="col-span-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Item details</p>
        {rows.map(([k, v]) => (
          <div key={k}><dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt><dd className="font-semibold">{v ?? "-"}</dd></div>
        ))}
      </dl>
      {m.Barcode ? <div className="rounded-2xl border bg-white p-3 text-black"><Barcode value={m.Barcode} className="mx-auto h-20 w-full max-w-xs" /></div> : null}
      <Button size="lg" className="w-full" disabled={busy} onClick={onResolve}>{busy ? <Loader2 className="animate-spin" /> : null} Resolve &amp; Print</Button>
      <Button render={<Link href={assistHref} />} nativeButton={false} variant="outline" size="lg" className="w-full">Send to Resolver</Button>
    </div>
  );
}

function ActionCard({ d, token }: { d: IncidentDetail; token: string }) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string | null>(d.candidates[0]?.key ?? null);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["incident", d.id] }), qc.invalidateQueries({ queryKey: ["incidents"] })]);
  const confirm = useMutation({ mutationFn: (key: string | null) => api.confirmIncident(token, d.id, key), onSuccess: () => { toast.success("Match confirmed"); return refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const dispose = useMutation({ mutationFn: (x: Disposition) => api.setDisposition(token, d.id, x), onSuccess: () => { toast.success("Ticket closed"); return refresh(); }, onError: (e: Error) => toast.error(e.message) });

  useEffect(() => {
    if (d.unread) void api.markRead(token, d.id).then(() => qc.invalidateQueries({ queryKey: ["incidents"] }));
  }, [d.unread, d.id, token, qc]);

  const assistHref = `/incident/${d.id}/assist`;
  const assist = <Button render={<Link href={assistHref} />} nativeButton={false} variant="outline" size="lg" className="w-full"><ShieldAlert /> Request assistance</Button>;

  switch (d.state) {
    case "METADATA_PENDING":
      return <Card><CardContent className="flex items-center gap-3"><Loader2 className="animate-spin text-primary" /> <p className="font-medium">Analyzing the photos…</p></CardContent></Card>;

    case "CANDIDATES_READY": {
      if (d.gating === "RED") {
        return (
          <Card className="ring-2 ring-destructive/30">
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 font-semibold text-destructive"><AlertTriangle size={18} /> We can&apos;t print this one yet</div>
              <p className="text-sm text-muted-foreground">{BLOCKED_COPY[d.gating_reason ?? ""] ?? "The match is too uncertain to print."} A resolver can identify it for you.</p>
              {assist}
            </CardContent>
          </Card>
        );
      }
      if (d.gating === "GREEN" && d.candidates[0]) {
        return <Card><CardContent><SimilarItem c={d.candidates[0]} busy={confirm.isPending} assistHref={assistHref} onResolve={() => confirm.mutate(d.candidates[0].key)} /></CardContent></Card>;
      }
      return (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between"><h2 className="font-bold">Which item is it?</h2>{d.gating ? <GatingBadge gating={d.gating} /> : null}</div>
            <div className="space-y-2">{d.candidates.map((c) => <CandidateCard key={c.key} c={c} selected={c.key === picked} onSelect={() => setPicked(c.key)} />)}</div>
            <Button size="lg" className="w-full" disabled={!picked || confirm.isPending} onClick={() => confirm.mutate(picked)}>{confirm.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Resolve &amp; Print</Button>
            <p className="text-center text-xs text-muted-foreground">Not the right item?</p>
            {assist}
          </CardContent>
        </Card>
      );
    }

    case "ESCALATED":
    case "RESOLUTION_IN_PROGRESS":
      return (
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 font-semibold"><Clock size={18} className="text-warning" /> {d.state === "ESCALATED" ? "Waiting for a resolver" : "A resolver is working on it"}</div>
            {d.escalation ? <p className="text-sm text-muted-foreground">{REASONS[d.escalation.reason].label}{d.escalation.note ? ` · “${d.escalation.note}”` : ""} · {d.escalation.item_age === "NEW_FREIGHT" ? "New freight" : "Old merchandise"}</p> : null}
            <p className="text-sm text-muted-foreground">You&apos;ll find the answer in your Inbox.</p>
          </CardContent>
        </Card>
      );

    case "RESOLVER_RESPONSE_RECEIVED": {
      const r = d.resolver;
      if (r?.decision === "RECOMMEND" && r.recommended) {
        return (
          <Card className="ring-2 ring-primary/30">
            <CardContent className="space-y-3">
              <div><p className="font-bold">Action needed</p><p className="text-sm text-muted-foreground">The resolver found the item. Accept it, then print a replacement tag.</p></div>
              <CandidateCard c={{ key: "rec", sku: r.recommended.Sku, metadata: r.recommended, score: 1, evidence: "barcode", thumb: null }} selected onSelect={() => undefined} />
              {r.comment ? <p className="rounded-xl bg-muted/70 p-3 text-sm">“{r.comment}”</p> : null}
              <Button size="lg" className="w-full" disabled={confirm.isPending} onClick={() => confirm.mutate(null)}>{confirm.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Accept &amp; print tag</Button>
            </CardContent>
          </Card>
        );
      }
      return (
        <Card className="ring-2 ring-warning/30">
          <CardContent className="space-y-3">
            <div><p className="font-bold">Action needed</p><p className="text-sm font-semibold">Disposition</p><p className="text-sm text-muted-foreground">Once you pick what happened to this item, it will move out of your Inbox.</p></div>
            <Alert>
              <HelpCircle />
              <AlertTitle>{r?.decision === "NOT_APPAREL" ? "Not CT Merch" : "Can't Resolve"}</AlertTitle>
              <AlertDescription>{r?.comment}</AlertDescription>
            </Alert>
            <div className="grid gap-2 sm:grid-cols-3">
              {DISPOSITIONS.map(({ key, label, icon: Icon }) => (
                <Button key={key} variant="outline" size="lg" disabled={dispose.isPending} onClick={() => dispose.mutate(key)}><Icon /> {label}</Button>
              ))}
            </div>
          </CardContent>
        </Card>
      );
    }

    case "CONFIRMED":
    case "PRINTED":
      return <Card><CardContent className="space-y-4"><PrintPanel d={d} />{d.state === "CONFIRMED" ? assist : null}</CardContent></Card>;

    case "COMPLETED":
      return <Card><CardContent className="flex items-center gap-2 font-semibold"><CheckCircle2 size={18} className="text-success" /> Completed. The new tag is on the item.</CardContent></Card>;

    case "CLOSED":
      return <Card><CardContent className="text-sm text-muted-foreground">Closed{d.disposition ? ` · ${dispositionLabel(d.disposition)}` : ""}.</CardContent></Card>;

    case "FAILED":
      return (
        <Card className="ring-2 ring-destructive/30">
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-destructive"><AlertTriangle size={18} /> Analysis failed</div>
            <p className="text-sm text-muted-foreground">{d.extraction?.error_message}</p>
            {assist}
          </CardContent>
        </Card>
      );
  }
}

export default function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const token = useSession((s) => s.token);
  const { data: d, isLoading, error } = useIncident(id);
  const { data: imageData } = useIncidentImages(id);
  const refreshLibrary = useLibrary((s) => s.refresh);
  const [active, setActive] = useState(0);
  const [added, setAdded] = useState(false);
  void router;

  if (isLoading || !token) return <AppShell title="Ticket" back="/inbox"><TicketSkeleton /></AppShell>;
  if (error || !d) {
    return (
      <AppShell title="Ticket not found" back="/inbox">
        <p className="text-muted-foreground">We couldn&apos;t find this ticket.</p>
        <Button render={<Link href="/" />} nativeButton={false} variant="link" className="px-0">Go home</Button>
      </AppShell>
    );
  }

  const ex = d.extraction;
  const meta = d.selected?.metadata ?? ex?.normalized_metadata;
  const match = d.analysis.match;
  const failed = ex?.status === "failed" || (!meta && d.state !== "METADATA_PENDING");
  const photos = imageData?.images ?? [];
  const photo = photos[Math.min(active, Math.max(photos.length - 1, 0))];
  const canAdd = Boolean(!failed && !match && !added && d.embeddings?.length && d.thumb && ex?.normalized_metadata);

  async function addToLibrary() {
    if (!ex?.normalized_metadata || !d?.embeddings?.length || !d.thumb) return;
    try {
      await api.addReference(token!, { metadata: ex.normalized_metadata, thumb: d.thumb, embeddings: d.embeddings });
      await refreshLibrary();
      setAdded(true);
      toast.success("Added to the reference library");
    } catch {
      toast.error("Could not save to the reference library");
    }
  }

  return (
    <AppShell
      title={d.title.toUpperCase()}
      subtitle={`#${String(d.short_number).padStart(3, "0")} · ${timeAgo(d.created_at)}`}
      back="/inbox"
      footer={<Button render={<Link href="/capture" />} nativeButton={false} size="lg" variant="outline" className="w-full"><Plus /> Capture another item</Button>}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StateBadge s={d} />
        <PriorityBadge priority={d.priority} />
        {d.gating && d.state === "CANDIDATES_READY" ? <GatingBadge gating={d.gating} /> : null}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={d.state} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}>
          <ActionCard d={d} token={token} />
        </motion.div>
      </AnimatePresence>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Barcode</h2>
        {meta?.Barcode ? (
          <div className="rounded-2xl border bg-white p-4 text-black"><Barcode value={meta.Barcode} className="mx-auto h-24 w-full max-w-xs" /></div>
        ) : (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Barcode unavailable.</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Photos</h2>
        {photos.length === 0 ? <p className="text-sm text-muted-foreground">{d.image_count === 0 ? "No photo was taken. This item was found by its barcode." : "Loading photos…"}</p> : null}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {photos.map((p, i) => (
            <motion.button key={p.capture.sha256} whileTap={{ scale: 0.94 }} onClick={() => setActive(i)} aria-label={`Show ${p.slot} photo`} className={`shrink-0 overflow-hidden rounded-xl border-2 transition ${i === active ? "border-primary" : "border-transparent opacity-60"}`}>
              <SafeImg src={p.data_url} className="size-20" />
            </motion.button>
          ))}
        </div>
        {photo ? (
          <div className="mt-3">
            <SafeImg src={photo.data_url} className="aspect-[4/3] w-full rounded-2xl" contain />
            <p className="mb-3 mt-4 text-sm font-semibold">{SLOTS.find((s) => s.key === photo.slot)?.label}</p>
            <MetadataCard m={photo.capture} />
          </div>
        ) : null}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Item age</h2>
        <Badge variant="secondary" className="h-7 px-3 text-sm"><HelpCircle /> {d.item_age === "NEW_FREIGHT" ? "New freight" : d.item_age === "OLD_MERCHANDISE" ? "Old merchandise" : "Not specified"}</Badge>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold">Item details</h2>
          {!failed && ex?.confidence != null ? <ConfidenceRing value={ex.confidence} /> : null}
        </div>
        {failed ? (
          <Alert variant="destructive"><AlertTriangle /><AlertDescription>{ex?.error_message ?? "No metadata available."}</AlertDescription></Alert>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
              {DETAILS.map((f) => {
                const value = f.keys.map((k) => meta?.[k]).filter(Boolean);
                const src = ex?.field_sources[f.keys[0]];
                return (
                  <div key={f.label}>
                    <dt className="text-sm text-muted-foreground">{f.label}</dt>
                    <dd className="font-semibold">{value.length ? value.join(" · ") : "-"}</dd>
                    {src ? <div className="mt-1"><SourceBadge source={src.source} confidence={src.confidence} /></div> : null}
                  </div>
                );
              })}
            </dl>
            {ex?.ocr_text ? <p className="mt-4 flex items-start gap-2 whitespace-pre-line rounded-xl border border-dashed p-3 font-mono text-xs"><Tag size={14} className="mt-0.5 shrink-0 text-primary" />{ex.ocr_text}</p> : null}
            {ex?.warnings.map((w) => (
              <Alert key={w} className="mt-2 border-warning/30 bg-warning/10"><AlertTriangle className="text-warning" /><AlertDescription>{w}</AlertDescription></Alert>
            ))}
            <Card className="mt-4">
              <CardContent>
                <h3 className="flex items-center gap-2 text-sm font-bold"><CircleHelp size={16} className="text-primary" /> How we identified this</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {match
                      ? `Your photo is ${Math.round(match.similarity * 100)}% similar to a saved item. Vector search in the database found it, and matches above ${Math.round(d.analysis.match_threshold * 100)}% are accepted.`
                      : d.analysis.top_matches[0]
                        ? `The closest saved item was ${Math.round(d.analysis.top_matches[0].similarity * 100)}% similar (needs ${Math.round(d.analysis.match_threshold * 100)}%). Category and color came from the image, brand, size and barcode from the tag.`
                        : "Nothing similar is saved yet, so category and color came from the image and brand, size and barcode from the tag text."}
                </p>
                {ex?.missing_fields.length ? <p className="mt-3 text-xs text-muted-foreground">Not found: {ex.missing_fields.join(", ")}</p> : null}
                {canAdd ? <Button variant="outline" className="mt-4 w-full" onClick={addToLibrary}><BookmarkPlus /> Add to reference library</Button> : null}
                {added ? <p className="mt-3 text-sm font-medium text-success">Saved. Future photos of this item will match it.</p> : null}
              </CardContent>
            </Card>
          </>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Activity</h2>
        <ol className="space-y-3 border-l-2 pl-4">
          {d.events.map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-primary" />
              <p className="text-sm font-semibold">{e.type.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</p>
              <p className="text-xs text-muted-foreground">{e.actor} · {formatDateTime(e.created_at)}</p>
            </li>
          ))}
        </ol>
      </section>
    </AppShell>
  );
}
