"use client";

import { AlertTriangle, Camera, Check, ChevronLeft, ChevronRight, ImagePlus, Info, Loader2, MessageSquare, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { CameraSheet } from "@/components/camera-sheet";
import { UpcBadge } from "@/components/qc-badges";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { makeThumb } from "@/lib/image";
import { CHECKS, FLAG_REASONS, type CheckKey, type FlagReason, type Pallet, type ShipmentDetail, type Upc, type UpcDetail } from "@/lib/qc/dto";
import { matchCount, palletTotal, suggestedReason } from "@/lib/qc/match";
import { useQcMutations, useUpc } from "@/lib/qc/queries";

type Step = 1 | 2 | 3 | 4;
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "UPCs" },
  { n: 2, label: "Product" },
  { n: 3, label: "Count" },
  { n: 4, label: "Labels" },
];
const MAX_PHOTOS = 5;
const PRODUCT_CHECKS = CHECKS.slice(0, 5);
const LABEL_CHECKS = CHECKS.slice(5);
const digits = (v: string) => v.replace(/\D/g, "");
const num = (v: string) => (v === "" ? null : Number(v));
const fmt = (n: number) => n.toLocaleString();

function InfoHint({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={`What is ${label}?`} aria-pressed={open} className={`inline-grid size-5 place-items-center rounded-full align-middle outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${open ? "bg-primary text-primary-foreground" : "text-primary hover:bg-primary/10"}`}>
        <Info size={14} />
      </button>
      {open ? <span role="note" className="mt-2 block rounded-xl bg-primary/8 p-3 text-sm font-normal leading-relaxed text-foreground">{text}</span> : null}
    </>
  );
}

function StepTabs({ step, unlocked, onGo, onBack }: { step: Step; unlocked: boolean; onGo: (s: Step) => void; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" aria-label="Back" className="size-11 shrink-0 rounded-full" onClick={onBack}><ChevronLeft /></Button>
      <div role="tablist" aria-label="QC steps" className="flex min-w-0 flex-1 gap-1.5">
        {STEPS.map(({ n, label }) => {
          const done = n < step;
          const current = n === step;
          const locked = n > 1 && !unlocked;
          return (
            <button key={n} role="tab" aria-selected={current} disabled={locked || (n > step)} onClick={() => onGo(n)} className={`flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-1 sm:text-sm ${current ? "flex-[2.4]" : "flex-1"} ${current ? "border-transparent bg-primary text-primary-foreground shadow-md shadow-primary/25" : done ? "border-success/30 bg-success/12 text-success" : "bg-card text-muted-foreground disabled:opacity-60"}`}>
              <span className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] ${current ? "bg-white/25" : done ? "bg-success/20" : "bg-muted"}`}>{done ? <Check size={12} /> : n}</span>
              <span className={`truncate ${current ? "" : "hidden sm:inline"}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function UpcBar({ upc, index, total, pallet }: { upc: UpcDetail; index: number; total: number; pallet: Pallet | null }) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-2xl bg-primary p-3.5 text-primary-foreground shadow-lg shadow-primary/20 sm:grid-cols-[1.3fr_1fr_1.4fr]">
      <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Current UPC</p><p className="truncate font-mono text-sm font-bold">{upc.upc_code}</p><p className="text-[11px] opacity-70">UPC {index} of {total}</p></div>
      <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Pallet</p><p className="truncate text-sm font-bold">{pallet ? `Pallet ${pallet.position}` : "-"}</p></div>
      <div className="col-span-2 min-w-0 sm:col-span-1"><p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Style / Colour</p><p className="truncate text-sm font-bold">{upc.style_number} · {upc.color_name}</p><p className="truncate text-[11px] opacity-70">{upc.description}</p></div>
    </div>
  );
}

/** What people wrote about this UPC, here or in the State Machine. */
function Notes({ comments }: { comments: UpcDetail["comments"] }) {
  const [open, setOpen] = useState(false);
  if (!comments.length) return null;
  return (
    <section className="rounded-2xl border bg-card shadow-sm">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 p-3.5 text-left text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="flex items-center gap-2"><MessageSquare size={16} className="text-primary" /> Notes ({comments.length})</span>
        <ChevronRight size={16} className={`transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open ? (
        <ul className="space-y-2 border-t p-3.5">
          {comments.map((c) => (
            <li key={c.id} className="rounded-xl bg-muted/50 p-2.5 text-sm">
              <p>{c.text}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{c.author ? `${c.author} · ` : ""}{formatDateTime(c.created_at)}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function CountProgress({ expected, counted }: { expected: number; counted: number }) {
  const variance = counted - expected;
  const remaining = Math.max(0, expected - counted);
  const pct = expected ? Math.min(100, Math.round((counted / expected) * 100)) : 0;
  const exact = counted === expected && expected > 0;
  return (
    <div className="rounded-2xl border bg-card p-3.5 shadow-sm">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>This UPC so far</span>
        {exact ? <span className="normal-case tracking-normal text-success">Matches the PO.</span> : null}
      </div>
      <Progress value={pct} className="my-2 h-2" />
      <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4 sm:gap-2">
        {[
          { label: "You counted", value: fmt(counted), tone: "text-primary" },
          { label: "PO says", value: fmt(expected), tone: "" },
          { label: "Still to count", value: fmt(remaining), tone: remaining ? "text-warning-foreground" : "text-success" },
          { label: "Difference", value: counted === 0 ? "-" : `${variance > 0 ? "+" : ""}${fmt(variance)}`, tone: counted === 0 ? "" : variance === 0 ? "text-success" : "text-destructive" },
        ].map((m) => (
          <div key={m.label}><p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{m.label}</p><p className={`text-lg font-bold ${m.tone}`}>{m.value}</p></div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ step 1

function StepUpcs({ shipment, onPick, onReview }: { shipment: ShipmentDetail; onPick: (u: Upc) => void; onReview: () => void }) {
  const { reopen } = useQcMutations();
  const [reopening, setReopening] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const t = shipment.totals;
  const pct = t.upcs ? Math.round(((t.approved + t.wont_qc) / t.upcs) * 100) : 0;
  const ready = t.blocking === 0;

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="text-xl font-bold">1. Pick a UPC</h2>
      <p className="mt-1 text-sm text-muted-foreground">Tap the UPC you are standing in front of. For each of its pallets you will check the product, count the units and confirm the labels. A UPC turns green when it is approved.</p>

      <div className="mt-4 rounded-2xl border bg-muted/40 p-3.5">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><span>Worksheet summary</span><span className="text-success">{pct}% complete</span></div>
        <Progress value={pct} className="my-2 h-2" />
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {[
            ["UPCs approved", `${t.approved}/${t.upcs}`],
            ["Held for supervisor", String(t.on_hold)],
            ["In progress", String(shipment.upcs.filter((u) => u.state === "IN_PROGRESS").length)],
            ["Units counted", fmt(t.received)],
            ["Units on the PO", fmt(t.units)],
            ["Skipped (won't QC)", String(t.wont_qc)],
          ].map(([label, value]) => (
            <div key={label}><p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="text-lg font-bold">{value}</p></div>
          ))}
        </div>
      </div>

      <ul className="mt-4 space-y-2.5">
        {shipment.upcs.map((u) => {
          const approved = u.state === "APPROVED";
          const hold = u.state === "SUPERVISOR_HOLD";
          const skipped = u.state === "WONT_QC";
          return (
            <li key={u.id}>
              <button disabled={hold || skipped} onClick={() => (approved ? setReopening(reopening === u.id ? null : u.id) : onPick(u))} className={`w-full rounded-2xl border p-3.5 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${approved ? "border-success/40 bg-success/8" : hold ? "border-destructive/30 bg-destructive/5" : u.state === "IN_PROGRESS" ? "border-warning/50 bg-warning/8" : "bg-card hover:bg-muted/40"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product</p>
                    <p className="truncate text-base font-bold">{u.description}</p>
                  </div>
                  <UpcBadge state={u.state} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-4">
                  {[
                    ["UPC (barcode)", u.upc_code, "font-mono"],
                    ["Colour", u.color_name, ""],
                    ["Style", u.style_number, ""],
                    ["Size", u.size_label, ""],
                  ].map(([label, value, extra]) => (
                    <div key={label} className="min-w-0"><dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt><dd className={`truncate font-medium ${extra}`}>{value}</dd></div>
                  ))}
                </dl>
                <dl className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-2.5 text-sm">
                  <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Units on the PO</dt><dd className="text-lg font-bold">{fmt(u.expected_units)}</dd></div>
                  <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Units you counted</dt><dd className={`text-lg font-bold ${u.received_units ? (u.received_units === u.expected_units ? "text-success" : "text-destructive") : ""}`}>{fmt(u.received_units)}</dd></div>
                </dl>
                <p className="mt-2 flex items-center justify-end gap-1 text-xs text-muted-foreground">{approved ? "Approved. Tap to send back for rework" : hold ? "Waiting for the supervisor" : skipped ? "Skipped by the supervisor" : u.state === "IN_PROGRESS" ? "Tap to continue" : "Tap to start"} <ChevronRight size={12} /></p>
              </button>
              {reopening === u.id ? (
                <div className="mt-2 space-y-2 rounded-xl border bg-card p-3">
                  <Textarea rows={2} placeholder="What needs to be redone?" value={why} onChange={(e) => setWhy(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={() => setReopening(null)}>Cancel</Button>
                    <Button size="sm" disabled={!why.trim() || reopen.isPending} onClick={() => reopen.mutate({ id: u.id, reason: why.trim() }, { onSuccess: () => { setReopening(null); setWhy(""); toast.success("Sent back for rework"); }, onError: (e) => toast.error(e.message) })}>{reopen.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reopen</Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="mt-4 rounded-xl bg-primary/8 p-3 text-xs leading-relaxed">There are {t.upcs} UPCs on this PO. If something is wrong with a UPC, flag it: it is held for the supervisor, who can approve it, send it back for a recount, or skip it. The &quot;Review and submit&quot; button appears when every UPC is approved or skipped.</p>

      {ready ? (
        <div className="mt-4 rounded-2xl border border-success/40 bg-success/8 p-4">
          <p className="font-semibold text-success">All UPCs are done</p>
          <p className="mt-1 text-sm text-muted-foreground">Look over the summary, then submit QC so the PO can go to receipt.</p>
          <Button size="lg" className="mt-3 h-12 w-full" onClick={onReview}>Review and submit <ChevronRight /></Button>
        </div>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------------ step 2

/** Photos for one purpose, with the camera and upload buttons. A required photo shows a clear warning until one is added. */
function PhotoPicker({ title, photos, required, requiredText, editable, pending, onAdd, alt }: { title: string; photos: string[]; required: boolean; requiredText: string; editable: boolean; pending: boolean; onAdd: (blob: Blob) => void; alt: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title} ({photos.length}/{MAX_PHOTOS}){required ? " · required" : ""}</p>
      {photos.length ? (
        <div className="mb-2 grid grid-cols-3 gap-2">
          {photos.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt={`${alt} ${i + 1}`} className="aspect-square w-full rounded-xl border object-cover" />
          ))}
        </div>
      ) : required ? <p className="mb-2 rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">{requiredText}</p> : null}
      {editable && photos.length < MAX_PHOTOS ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" className="h-12" disabled={pending} onClick={() => setCameraOpen(true)}>{pending ? <Loader2 className="animate-spin" /> : <Camera />} Take photo</Button>
          <Button variant="outline" size="lg" className="h-12" disabled={pending} onClick={() => fileRef.current?.click()}><ImagePlus /> Upload</Button>
        </div>
      ) : null}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onAdd(f); }} />
      {cameraOpen ? <CameraSheet onCapture={(b) => { setCameraOpen(false); onAdd(b); }} onClose={() => setCameraOpen(false)} /> : null}
    </div>
  );
}

function StepProduct({ upc, pallet, bundled, setBundled, checks, setChecks, editable }: { upc: UpcDetail; pallet: Pallet; bundled: boolean; setBundled: (v: boolean) => void; checks: Record<CheckKey, boolean>; setChecks: Dispatch<SetStateAction<Record<CheckKey, boolean>>>; editable: boolean }) {
  const { photo } = useQcMutations();
  const sub: Record<string, string> = {
    inspect_case_opened: "Open one case and look at the carton seal",
    inspect_style_confirmed: `PO says style ${upc.style_number}`,
    inspect_color_confirmed: `PO says colour ${upc.color_name}`,
    inspect_upc_confirmed: `PO says UPC ${upc.upc_code}`,
    inspect_price_confirmed: `PO says retail price $${upc.retail_price}`,
  };

  async function add(blob: Blob) {
    photo.mutate({ id: upc.id, photo: await makeThumb(blob, 640), kind: "goods" }, { onSuccess: () => toast.success("Photo saved"), onError: (e) => toast.error(e.message) });
  }

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="text-xl font-bold">2. Check the product</h2>
      <p className="mt-1 text-sm text-muted-foreground">Open one case from Pallet {pallet.position} and compare it with the PO. Tick each box once you have checked it. Then add at least one photo of the goods. <strong>A photo is required.</strong></p>

      <div className="mt-4 overflow-hidden rounded-2xl border">
        <p className="bg-muted/60 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tick each one when checked</p>
        <ul className="divide-y">
          {PRODUCT_CHECKS.map(([key, label]) => (
            <li key={key}>
              <button disabled={!editable} role="checkbox" aria-checked={checks[key]} onClick={() => setChecks((c) => ({ ...c, [key]: !c[key] }))} className="flex w-full items-center gap-3 px-3.5 py-3 text-left outline-none focus-visible:bg-muted/50 disabled:opacity-60">
                <span className={`grid size-6 shrink-0 place-items-center rounded-md border-2 ${checks[key] ? "border-success bg-success text-white" : "border-muted-foreground/40"}`}>{checks[key] ? <Check size={15} /> : null}</span>
                <span><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-muted-foreground">{sub[key]}</span></span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 rounded-2xl border p-3.5">
        <p className="text-sm font-semibold">Are the units packed in bundles? <InfoHint label="packed in bundles" text="Yes if the units inside the case are grouped into small bundles (for example 4 bundles of 6). The count step then asks for bundles. Choose No if the units are loose in the case; the count step then asks for units per case." /></p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[true, false].map((v) => (
            <button key={String(v)} disabled={!editable} onClick={() => setBundled(v)} aria-pressed={bundled === v} className={`flex h-12 items-center gap-2 rounded-xl border px-3 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${bundled === v ? "border-primary bg-primary/10 text-primary" : "bg-card"}`}>
              <span className={`grid size-5 place-items-center rounded-md border-2 ${bundled === v ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}>{bundled === v ? <Check size={13} /> : null}</span>
              {v ? "Yes" : "No"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <PhotoPicker title="Photos of the goods" photos={upc.photos.filter((p) => p.kind === "goods").map((p) => p.src)} required requiredText="No photo yet. Take at least one photo of the goods to continue." editable={editable} pending={photo.isPending} onAdd={add} alt="Goods" />
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ step 3

const EXPLAIN = {
  mdl: "MDL is the number of units inside one bundle. The PO tells you what to expect. Pick up one bundle and count the units in it. Only change the number if what you see is different.",
  bundles: "Open one full case and count the bundles inside it. Count bundles only, not single units.",
  cases: "Count the cases on this pallet that are completely full. A case that is only partly filled does not go here. Put its units under loose units instead.",
  loose: "Add up every unit that is not inside a full case, for example what is left in a case that was opened or partly filled. Type 0 if there are none.",
  perCase: "Open one full case and count all the units inside it.",
};

type CountDraft = { mdl: string; bundles: string; cases: string; loose: string };

/** One question in the count: a title, a short explanation, a number box with minus and plus, the unit, and what the PO says. */
function CountRow({ n, title, help, info, infoLabel, value, onChange, unit, poSays, disabled, result }: { n: number; title: string; help: string; info: string; infoLabel: string; value: string; onChange: (v: string) => void; unit: string; poSays?: string; disabled: boolean; result?: { ok: boolean; text: string } | null }) {
  const bump = (delta: number) => onChange(String(Math.max(0, (value === "" ? 0 : Number(value)) + delta)));
  return (
    <section className="rounded-2xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">{n}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-tight">{title} <InfoHint label={infoLabel} text={info} /></h3>
          <p className="mt-1 text-sm text-muted-foreground">{help}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="inline-flex h-14 items-stretch overflow-hidden rounded-xl border bg-background focus-within:ring-3 focus-within:ring-ring/50">
              <button type="button" aria-label={`One fewer: ${title}`} disabled={disabled || value === "" || value === "0"} onClick={() => bump(-1)} className="grid w-12 place-items-center text-2xl text-muted-foreground outline-none hover:bg-muted focus-visible:bg-muted disabled:opacity-40">−</button>
              <input
                inputMode="numeric"
                aria-label={title}
                value={value}
                disabled={disabled}
                placeholder={poSays ? `e.g. ${poSays}` : "e.g. 0"}
                onChange={(e) => onChange(digits(e.target.value))}
                className="w-24 border-x bg-transparent text-center text-2xl font-bold outline-none placeholder:text-base placeholder:font-normal placeholder:text-muted-foreground/60 disabled:opacity-60"
              />
              <button type="button" aria-label={`One more: ${title}`} disabled={disabled} onClick={() => bump(1)} className="grid w-12 place-items-center text-2xl text-primary outline-none hover:bg-muted focus-visible:bg-muted disabled:opacity-40">+</button>
            </div>
            <span className="text-sm font-medium text-foreground">{unit}</span>
            {poSays ? <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">PO says {poSays}</span> : null}
          </div>

          {result ? <p className={`mt-3 w-fit max-w-full rounded-lg px-3 py-2 text-sm ${result.ok ? "bg-success/12 text-success" : "bg-warning/18 text-warning-foreground"}`}>{result.ok ? "✓ " : ""}{result.text}</p> : null}
        </div>
      </div>
    </section>
  );
}

function StepCount({ upc, pallet, bundled, draft, setDraft, editable }: { upc: UpcDetail; pallet: Pallet; bundled: boolean; draft: CountDraft; setDraft: (d: CountDraft) => void; editable: boolean }) {
  const set = (k: keyof CountDraft) => (v: string) => setDraft({ ...draft, [k]: v });
  const mdl = num(draft.mdl);
  const bundles = bundled ? num(draft.bundles) : 1;
  const perCase = (bundles ?? 0) * (mdl ?? 0);
  const cases = num(draft.cases);
  const loose = num(draft.loose);
  const total = palletTotal({ mdl_actual: mdl, bundles_per_case: bundles, full_cases_count: cases, partial_units: loose });
  const counted = upc.received_units - pallet.total_units + total;
  const remaining = Math.max(0, upc.expected_units - counted);
  const step = bundled ? 0 : -1;
  const rowNo = (n: number) => n + step;

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="text-xl font-bold">3. Count the units</h2>
      <p className="mt-1 text-sm text-muted-foreground">Answer the questions below from top to bottom. Tap the <Info size={13} className="inline text-primary" /> next to a question if you are not sure what it means. The app adds everything up for you.</p>

      <div className="mt-4 space-y-3">
        {bundled ? (
          <>
            <CountRow n={rowNo(1)} title="How many units are in one bundle?" help="Pick up one bundle and count the units in it." info={EXPLAIN.mdl} infoLabel="units in one bundle" value={draft.mdl} onChange={set("mdl")} unit="units" poSays={String(pallet.mdl_expected)} disabled={!editable}
              result={mdl === null ? null : mdl === pallet.mdl_expected ? { ok: true, text: "Same as the PO. No change needed." } : { ok: false, text: `The PO says ${pallet.mdl_expected}. Check that ${mdl} is what you counted.` }} />
            <CountRow n={rowNo(2)} title="How many bundles are in one full case?" help="Open one full case and count the bundles inside it." info={EXPLAIN.bundles} infoLabel="bundles in a case" value={draft.bundles} onChange={set("bundles")} unit="bundles" poSays={String(pallet.bundles_expected)} disabled={!editable}
              result={bundles !== null && mdl !== null && bundles > 0 ? { ok: true, text: `One full case = ${bundles} bundles × ${mdl} units = ${perCase} units.` } : null} />
          </>
        ) : (
          <CountRow n={1} title="How many units are in one full case?" help="Open one full case and count all the units inside it." info={EXPLAIN.perCase} infoLabel="units in a case" value={draft.mdl} onChange={set("mdl")} unit="units" poSays={String(pallet.mdl_expected * pallet.bundles_expected)} disabled={!editable} />
        )}
        <CountRow n={rowNo(3)} title="How many full cases are on this pallet?" help="Count only the cases that are completely full." info={EXPLAIN.cases} infoLabel="full cases" value={draft.cases} onChange={set("cases")} unit="cases" poSays={pallet.expected_units ? String(Math.floor(pallet.expected_units / Math.max(1, pallet.mdl_expected * pallet.bundles_expected))) : undefined} disabled={!editable} />
        <CountRow n={rowNo(4)} title="How many loose units are there?" help="Units that are not in a full case. Type 0 if there are none." info={EXPLAIN.loose} infoLabel="loose units" value={draft.loose} onChange={set("loose")} unit="units" disabled={!editable} />
      </div>

      <div className="mt-4 rounded-2xl border-2 border-primary/30 bg-primary/5 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">This pallet adds up to</p>
        <p className="mt-1 text-3xl font-bold text-primary">{fmt(total)} <span className="text-base font-medium text-muted-foreground">units</span></p>
        <p className="mt-1 text-sm text-muted-foreground">{cases ?? 0} full cases × {perCase} units per case + {loose ?? 0} loose units</p>
        <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-sm">
          <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Counted on the whole UPC</p><p className="text-lg font-bold">{fmt(counted)}</p></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Still to count (PO says {fmt(upc.expected_units)})</p><p className={`text-lg font-bold ${remaining ? "text-warning-foreground" : "text-success"}`}>{fmt(remaining)}</p></div>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ step 4

function StepLabels({ upc, pallet, checks, setChecks, editable, onAnother, onDone, busy }: { upc: UpcDetail; pallet: Pallet; checks: Record<CheckKey, boolean>; setChecks: Dispatch<SetStateAction<Record<CheckKey, boolean>>>; editable: boolean; onAnother: () => void; onDone: () => void; busy: boolean }) {
  const { photo } = useQcMutations();
  const labelPhotos = upc.photos.filter((p) => p.kind === "label" && p.pallet_id === pallet.id).map((p) => p.src);
  const hasLabelPhoto = labelPhotos.length >= 1;
  const labelsOk = LABEL_CHECKS.every(([k]) => checks[k]) && hasLabelPhoto;
  async function addLabelPhoto(blob: Blob) {
    photo.mutate({ id: upc.id, photo: await makeThumb(blob, 640), kind: "label", pallet_id: pallet.id }, { onSuccess: () => toast.success("Label photo saved"), onError: (e) => toast.error(e.message) });
  }
  const variance = pallet.expected_units ? pallet.total_units - pallet.expected_units : 0;
  const cases = pallet.full_cases_count ?? 0;
  const perCase = (pallet.bundles_per_case ?? 0) * (pallet.mdl_actual ?? 0);
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="text-xl font-bold">4. Confirm the labels</h2>
      <p className="mt-1 text-sm text-muted-foreground">Put the labels on the pallet and on every case, scan them, then tick both boxes. After that, tell us if this UPC has another pallet.</p>

      <div className="mt-4">
        <PhotoPicker title={`Photo of the labels on pallet ${pallet.position}`} photos={labelPhotos} required requiredText="No label photo yet. Take a photo that shows the pallet label and the case labels, then tick the boxes below." editable={editable} pending={photo.isPending} onAdd={addLabelPhoto} alt="Labels" />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border">
        <p className="bg-muted/60 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tick both when done</p>
        <ul className="divide-y">
          {LABEL_CHECKS.map(([key]) => (
            <li key={key}>
              <button disabled={!editable || !hasLabelPhoto} role="checkbox" aria-checked={checks[key]} onClick={() => setChecks((c) => ({ ...c, [key]: !c[key] }))} className="flex w-full items-center gap-3 px-3.5 py-3 text-left outline-none focus-visible:bg-muted/50 disabled:opacity-60">
                <span className={`grid size-6 shrink-0 place-items-center rounded-md border-2 ${checks[key] ? "border-success bg-success text-white" : "border-muted-foreground/40"}`}>{checks[key] ? <Check size={15} /> : null}</span>
                <span><span className="block text-sm font-semibold">{key === "label_pallet_confirmed" ? "Pallet label is on and scanned" : "Every case label is on and scanned"}</span><span className="block text-xs text-muted-foreground">{key === "label_pallet_confirmed" ? "One label on the pallet itself" : "Every case on this pallet has its label"}</span></span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 rounded-2xl border p-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pallet {pallet.position} result</p>
        <div className="mt-2 grid grid-cols-2 gap-3 text-center sm:grid-cols-4 sm:gap-2">
          {[
            ["Counted on this pallet", fmt(pallet.total_units), "text-primary"],
            ["PO says", pallet.expected_units ? fmt(pallet.expected_units) : "-", ""],
            ["Still to count", pallet.expected_units ? fmt(Math.max(0, pallet.expected_units - pallet.total_units)) : "-", ""],
            ["Difference", pallet.expected_units ? `${variance > 0 ? "+" : ""}${fmt(variance)}` : "-", variance === 0 ? "text-success" : "text-destructive"],
          ].map(([label, value, tone]) => (
            <div key={label}><p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className={`text-lg font-bold ${tone}`}>{value}</p></div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{cases} full cases × {pallet.bundles_per_case ?? 0} bundles × {pallet.mdl_actual ?? 0} units + {pallet.partial_units ?? 0} loose = {fmt(cases * perCase + (pallet.partial_units ?? 0))} units</p>
      </div>

      <div className="mt-3 rounded-2xl border p-3.5">
        <p className="text-sm font-bold uppercase">Does this UPC have another pallet?</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button size="lg" className="h-12" disabled={!editable || !labelsOk || busy} onClick={onAnother}>{busy ? <Loader2 className="animate-spin" /> : <RotateCcw />} Yes, check the next pallet</Button>
          <Button size="lg" className="h-12 bg-success text-white hover:bg-success/90" disabled={!editable || !labelsOk || busy} onClick={onDone}>{busy ? <Loader2 className="animate-spin" /> : <Check />} No, finish this UPC</Button>
        </div>
        {!labelsOk ? <p className="mt-2 text-xs text-muted-foreground">{!hasLabelPhoto ? "Add the label photo first, then tick both boxes." : "Tick both label boxes first."}</p> : null}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ one pallet: steps 2 to 4

/** The inputs, content and button bar for one pallet. It is keyed by pallet, so each pallet starts from what is saved. */
function PalletFlow({ upc, pallet, step, setStep, onPallet, onToUpcs }: { upc: UpcDetail; pallet: Pallet; step: Step; setStep: (s: Step) => void; onPallet: (id: string) => void; onToUpcs: () => void }) {
  const { pallet: save, approve, flag, addPallet } = useQcMutations();
  const editable = upc.shipment_state === "IN_PROGRESS" && (upc.state === "PENDING" || upc.state === "IN_PROGRESS");
  const [bundled, setBundled] = useState(upc.is_prepack);
  const [checks, setChecks] = useState<Record<CheckKey, boolean>>(pallet.checks);
  const [draft, setDraft] = useState<CountDraft>({
    mdl: pallet.mdl_actual !== null ? String(pallet.mdl_actual) : upc.is_prepack ? String(pallet.mdl_expected) : "",
    bundles: pallet.bundles_per_case !== null && upc.is_prepack ? String(pallet.bundles_per_case) : "",
    cases: pallet.full_cases_count !== null ? String(pallet.full_cases_count) : "",
    loose: pallet.partial_units !== null ? String(pallet.partial_units) : "",
  });
  const [flagOpen, setFlagOpen] = useState(false);
  const [reason, setReason] = useState<FlagReason | null>(null);
  const [note, setNote] = useState("");
  const fail = (e: Error) => toast.error(e.message);
  const busy = save.isPending || approve.isPending || addPallet.isPending;
  const suggested: FlagReason = reason ?? (upc.count ? suggestedReason(upc.count.result) : "OTHER");

  const hasPhoto = upc.photo_count >= 1;
  const productReady = PRODUCT_CHECKS.every(([k]) => checks[k]) && hasPhoto;
  const countReady = num(draft.mdl) !== null && (!bundled || num(draft.bundles) !== null) && num(draft.cases) !== null;

  async function acceptProduct() {
    await save.mutateAsync({ upcId: upc.id, palletId: pallet.id, checks, is_prepack: bundled }).then(() => setStep(3), fail);
  }
  async function acceptCount() {
    await save
      .mutateAsync({ upcId: upc.id, palletId: pallet.id, mdl_actual: num(draft.mdl) ?? 0, bundles_per_case: bundled ? (num(draft.bundles) ?? 0) : 1, full_cases_count: num(draft.cases) ?? 0, partial_units: num(draft.loose) ?? 0 })
      .then(() => setStep(4), fail);
  }
  async function saveLabels(): Promise<UpcDetail | null> {
    return save.mutateAsync({ upcId: upc.id, palletId: pallet.id, checks }).catch((e: Error) => { fail(e); return null; });
  }
  async function anotherPallet() {
    const fresh = await saveLabels();
    if (!fresh) return;
    const next = fresh.pallets.find((x) => x.id !== pallet.id && x.status !== "COMPLETE");
    try {
      const target = next ?? (await addPallet.mutateAsync(upc.id)).pallets.at(-1);
      if (target) {
        onPallet(target.id);
        setStep(2);
        toast.success(`Pallet ${target.position} ready`);
      }
    } catch (e) {
      fail(e as Error);
    }
  }
  /** Done with a UPC: approve it when everything adds up, otherwise ask for a flag. */
  async function doneWithUpc() {
    const fresh = await saveLabels();
    if (!fresh) return;
    const incomplete = fresh.pallets.find((x) => x.status !== "COMPLETE");
    if (incomplete) return toast.error(`Pallet ${incomplete.position} is not finished yet`);
    const result = matchCount(fresh.expected_units, fresh.received_units);
    if (result.result !== "MATCH") {
      toast.warning(`The count is ${result.result === "SHORT" ? "short" : "over"} by ${result.diff}. Flag it for the supervisor.`);
      setReason(suggestedReason(result.result));
      return setFlagOpen(true);
    }
    if (fresh.photo_count < 1) {
      toast.error("Add at least one product photo first");
      return setStep(2);
    }
    approve.mutate(fresh.id, { onSuccess: () => { toast.success(`${fresh.description} approved`); onToUpcs(); }, onError: fail });
  }

  return (
    <>
      {step === 2 ? <StepProduct upc={upc} pallet={pallet} bundled={bundled} setBundled={setBundled} checks={checks} setChecks={setChecks} editable={editable} /> : null}
      {step === 3 ? <StepCount upc={upc} pallet={pallet} bundled={bundled} draft={draft} setDraft={setDraft} editable={editable} /> : null}
      {step === 4 ? <StepLabels upc={upc} pallet={pallet} checks={checks} setChecks={setChecks} editable={editable} busy={busy} onAnother={anotherPallet} onDone={doneWithUpc} /> : null}

      {flagOpen ? (
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Report a problem with this UPC</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose what is wrong. The UPC is held and a supervisor decides what happens next.</p>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Reason">
            {(Object.keys(FLAG_REASONS) as FlagReason[]).map((key) => (
              <button key={key} role="radio" aria-checked={suggested === key} onClick={() => setReason(key)} className={`rounded-full border px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${suggested === key ? "border-transparent bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}>{FLAG_REASONS[key]}</button>
            ))}
          </div>
          <Textarea className="mt-3" rows={3} placeholder="What happened? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setFlagOpen(false)} disabled={flag.isPending}>Cancel</Button>
            <Button variant="destructive" disabled={flag.isPending} onClick={() => flag.mutate({ id: upc.id, reason: suggested, note: note.trim() }, { onSuccess: () => { toast.success("Flagged for the supervisor"); onToUpcs(); }, onError: fail })}>{flag.isPending ? <Loader2 className="animate-spin" /> : null} Send to supervisor</Button>
          </div>
        </section>
      ) : null}

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 -mx-1 rounded-2xl border bg-background/90 p-2 shadow-lg backdrop-blur-xl">
        {step === 2 && editable && !productReady ? <p className="px-2 pb-2 text-center text-xs font-medium text-destructive">{!hasPhoto ? "Add at least one photo of the goods and tick all 5 boxes to continue." : "Tick all 5 boxes to continue."}</p> : null}
        <div className="grid grid-cols-[1fr_auto_1.4fr] gap-2">
          <Button variant="outline" className="h-12 min-w-0 px-3" onClick={() => (step === 2 ? onToUpcs() : setStep((step - 1) as Step))}><ChevronLeft className="shrink-0" /> <span className="truncate"><span className="sm:hidden">Back</span><span className="hidden sm:inline">{step === 2 ? "Back to UPCs" : step === 3 ? "Back to product" : "Back to count"}</span></span></Button>
          <Button variant="outline" className="h-12 border-destructive/40 text-destructive hover:bg-destructive/10" disabled={!editable} onClick={() => setFlagOpen(true)}><AlertTriangle className="shrink-0" /> <span className="hidden sm:inline">Report a problem</span></Button>
          {step === 2 ? <Button className="h-12 min-w-0 px-3" disabled={!editable || !productReady || busy} onClick={acceptProduct}>{busy ? <Loader2 className="animate-spin" /> : null} <span className="truncate"><span className="sm:hidden">Next</span><span className="hidden sm:inline">Continue to count</span></span> <ChevronRight className="shrink-0" /></Button> : null}
          {step === 3 ? <Button className="h-12 min-w-0 px-3" disabled={!editable || !countReady || busy} onClick={acceptCount}>{busy ? <Loader2 className="animate-spin" /> : null} <span className="truncate"><span className="sm:hidden">Next</span><span className="hidden sm:inline">Save count and continue</span></span> <ChevronRight className="shrink-0" /></Button> : null}
          {step === 4 ? <span className="self-center px-2 text-center text-xs text-muted-foreground">Answer the question above</span> : null}
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ the wizard

export function QcWizard({ shipment }: { shipment: ShipmentDetail }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [upcId, setUpcId] = useState<string | null>(null);
  const [palletId, setPalletId] = useState<string | null>(null);
  const { data: upc } = useUpc(upcId);

  const index = upc ? shipment.upcs.findIndex((u) => u.id === upc.id) + 1 : 0;
  const pallet = upc ? (upc.pallets.find((p) => p.id === palletId) ?? upc.pallets.find((p) => p.status !== "COMPLETE") ?? upc.pallets[0] ?? null) : null;

  const toUpcs = () => {
    setUpcId(null);
    setPalletId(null);
    setStep(1);
  };
  const pick = (u: Upc) => {
    setUpcId(u.id);
    setPalletId(null);
    setStep(2);
  };
  const back = () => (step === 1 ? router.push("/qc") : step === 2 ? toUpcs() : setStep((step - 1) as Step));

  return (
    <AppShell title="QC Check" subtitle="Work through each step at your own pace. You can flag an exception at any step." back="/qc" area="qc">
      <div className="space-y-3">
        <StepTabs step={step} unlocked={Boolean(upc)} onGo={(s) => (s === 1 ? toUpcs() : setStep(s))} onBack={back} />
        <p className="flex flex-wrap gap-x-4 gap-y-0.5 rounded-xl border bg-card px-3 py-2 text-xs"><span><span className="text-muted-foreground">Shipment #:</span> <strong>{shipment.shipment_number}</strong></span><span><span className="text-muted-foreground">PO:</span> <strong>{shipment.po_number}</strong></span><span className="min-w-0"><span className="text-muted-foreground">Vendor:</span> <strong>{shipment.vendor_name}</strong></span></p>

        {step === 1 ? <StepUpcs shipment={shipment} onPick={pick} onReview={() => router.push(`/qc/po/${shipment.id}/complete`)} /> : null}
        {step > 1 && upcId && !upc ? <p className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline animate-spin" size={16} /> Loading UPC…</p> : null}
        {step > 1 && upc && pallet ? (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              <UpcBar upc={upc} index={index} total={shipment.upcs.length} pallet={pallet} />
              <CountProgress expected={upc.expected_units} counted={upc.received_units} />
            </div>
            <Notes comments={upc.comments} />
            <PalletFlow key={pallet.id} upc={upc} pallet={pallet} step={step} setStep={setStep} onPallet={setPalletId} onToUpcs={toUpcs} />
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
