"use client";

import { AlertTriangle, Camera, Check, ChevronLeft, ChevronRight, ImagePlus, Info, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { CameraSheet } from "@/components/camera-sheet";
import { UpcBadge } from "@/components/qc-badges";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { makeThumb } from "@/lib/image";
import { CHECKS, FLAG_REASONS, type CheckKey, type FlagReason, type Pallet, type ShipmentDetail, type Upc, type UpcDetail } from "@/lib/qc/dto";
import { matchCount, palletTotal, suggestedReason } from "@/lib/qc/match";
import { useQcMutations, useUpc } from "@/lib/qc/queries";

type Step = 1 | 2 | 3 | 4;
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "UPCs" },
  { n: 2, label: "Product" },
  { n: 3, label: "Count" },
  { n: 4, label: "Scan Labels" },
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

function NumberField({ label, value, onChange, disabled, hint, big }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; hint?: string; big?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <input inputMode="numeric" value={value} disabled={disabled} placeholder="0" onChange={(e) => onChange(digits(e.target.value))} className={`mt-1 w-full rounded-xl border bg-background text-center font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 ${big ? "h-14 text-2xl" : "h-12 text-lg"}`} />
      {hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
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
      <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Current UPC</p><p className="truncate font-mono text-sm font-bold">{upc.upc_code} <span className="font-sans text-[11px] font-normal opacity-70">{index} of {total}</span></p></div>
      <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Pallet</p><p className="truncate text-sm font-bold">{pallet ? `Pallet ${pallet.position}` : "-"}</p></div>
      <div className="col-span-2 min-w-0 sm:col-span-1"><p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Style / Color</p><p className="truncate text-sm font-bold">{upc.style_number} · {upc.color_name}</p><p className="truncate text-[11px] opacity-70">{upc.description}</p></div>
    </div>
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
        <span>UPC total count progress</span>
        {exact ? <span className="normal-case tracking-normal text-success">Exact match reached.</span> : null}
      </div>
      <Progress value={pct} className="my-2 h-2" />
      <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4 sm:gap-2">
        {[
          { label: "Counted so far", value: fmt(counted), tone: "text-primary" },
          { label: "Expected", value: fmt(expected), tone: "" },
          { label: "Remaining", value: fmt(remaining), tone: remaining ? "text-warning-foreground" : "text-success" },
          { label: "Total variance", value: counted === 0 ? "-" : `${variance > 0 ? "+" : ""}${fmt(variance)}`, tone: counted === 0 ? "" : variance === 0 ? "text-success" : "text-destructive" },
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
      <h2 className="text-xl font-bold">1. UPCs</h2>
      <p className="mt-1 text-sm text-muted-foreground">UPCs are pre-loaded from the PO. Select the UPC you&apos;re standing in front of. After each pallet you&apos;ll be asked if there&apos;s another one. Return here once all pallets for a UPC are done.</p>

      <div className="mt-4 rounded-2xl border bg-muted/40 p-3.5">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><span>Worksheet summary</span><span className="text-success">{pct}% complete</span></div>
        <Progress value={pct} className="my-2 h-2" />
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {[
            ["UPCs approved", `${t.approved}/${t.upcs}`],
            ["UPCs flagged", String(t.on_hold)],
            ["Active UPCs", String(shipment.upcs.filter((u) => u.state === "IN_PROGRESS").length)],
            ["Units counted", fmt(t.received)],
            ["Expected units", fmt(t.units)],
            ["Won't QC", String(t.wont_qc)],
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
                    <p className="font-mono text-sm font-bold">{u.upc_code}</p>
                    <p className="truncate text-sm font-medium">{u.description}</p>
                    <p className="text-xs text-muted-foreground">{u.color_name} · Style {u.style_number}</p>
                  </div>
                  <UpcBadge state={u.state} />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                  <span>Expected: <strong>{fmt(u.expected_units)}</strong> · Counted: <strong>{fmt(u.received_units)}</strong></span>
                  <span className="text-muted-foreground">{approved ? "Tap to reopen for rework" : hold ? "Waiting for the supervisor" : skipped ? "Skipped by the supervisor" : "Tap to check"} <ChevronRight size={12} className="inline" /></span>
                </div>
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

      <p className="mt-4 rounded-xl bg-primary/8 p-3 text-xs leading-relaxed">Work through all {t.upcs} UPCs from the PO. UPCs flagged with an exception are held, but the rest of the PO can still proceed. The Review PO button appears once all non-held UPCs are approved.</p>

      {ready ? (
        <div className="mt-4 rounded-2xl border border-success/40 bg-success/8 p-4">
          <p className="font-semibold text-success">Ready to review all UPCs</p>
          <p className="mt-1 text-sm text-muted-foreground">Review the QC summary for this PO, then send it for receipt verification.</p>
          <Button size="lg" className="mt-3 h-12 w-full" onClick={onReview}>Review PO <ChevronRight /></Button>
        </div>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------------ step 2

function StepProduct({ upc, pallet, bundled, setBundled, checks, setChecks, editable }: { upc: UpcDetail; pallet: Pallet; bundled: boolean; setBundled: (v: boolean) => void; checks: Record<CheckKey, boolean>; setChecks: Dispatch<SetStateAction<Record<CheckKey, boolean>>>; editable: boolean }) {
  const { photo } = useQcMutations();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const sub: Record<string, string> = {
    inspect_case_opened: "Open one representative case and check the carton seal",
    inspect_style_confirmed: `${upc.style_number} — matches PO`,
    inspect_color_confirmed: `${upc.color_name} — matches PO`,
    inspect_upc_confirmed: `${upc.upc_code} — matches PO`,
    inspect_price_confirmed: `Retail $${upc.retail_price} — matches PO`,
  };

  async function add(blob: Blob) {
    setCameraOpen(false);
    photo.mutate({ id: upc.id, photo: await makeThumb(blob, 640) }, { onSuccess: () => toast.success("Photo saved"), onError: (e) => toast.error(e.message) });
  }

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="text-xl font-bold">2. Inspect Product</h2>
      <p className="mt-1 text-sm text-muted-foreground">Inspect one representative case for UPC {upc.upc_code} — Pallet {pallet.position}. Complete the checklist and photograph the item.</p>

      <div className="mt-4 overflow-hidden rounded-2xl border">
        <p className="bg-muted/60 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Inspection checklist</p>
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
        <p className="text-sm font-semibold">Is the product packed in bundles? <InfoHint label="packed in bundles" text="Yes if the units inside the case are grouped into small bundles (for example 4 bundles of 6). The count step then asks for bundles. Choose No if the units are loose in the case; the count step then asks for units per case." /></p>
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
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Product images ({upc.photos.length}/{MAX_PHOTOS})</p>
        {upc.photos.length ? (
          <div className="mb-2 grid grid-cols-3 gap-2">
            {upc.photos.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt={`Goods ${i + 1}`} className="aspect-square w-full rounded-xl border object-cover" />
            ))}
          </div>
        ) : <p className="mb-2 text-sm text-muted-foreground">At least one photo is needed before the UPC can be approved.</p>}
        {editable && upc.photos.length < MAX_PHOTOS ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="lg" className="h-12" disabled={photo.isPending} onClick={() => setCameraOpen(true)}>{photo.isPending ? <Loader2 className="animate-spin" /> : <Camera />} Take photo</Button>
            <Button variant="outline" size="lg" className="h-12" disabled={photo.isPending} onClick={() => fileRef.current?.click()}><ImagePlus /> Upload</Button>
          </div>
        ) : null}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await add(f); }} />
      </div>
      {cameraOpen ? <CameraSheet onCapture={add} onClose={() => setCameraOpen(false)} /> : null}
    </section>
  );
}

// ------------------------------------------------------------------ step 3

const EXPLAIN = {
  mdl: "MDL is how many units are in one bundle. It is filled in from the PO. Look at a bundle and count the units in it. Only change it if the real number is different.",
  bundles: "Open one full case and count the bundles inside it. Do not count loose units here.",
  cases: "How many full, complete cases are on this pallet. Do not include a case that is only partly filled. Put those units under loose units.",
  loose: "Units on the pallet that are not in a full case, such as what is left in an opened or partly filled case. Add them all up. Type 0 if there are none.",
  perCase: "How many units are in one full case. Open a case and count what is inside.",
};

type CountDraft = { mdl: string; bundles: string; cases: string; loose: string };

function StepCount({ upc, pallet, bundled, draft, setDraft, editable }: { upc: UpcDetail; pallet: Pallet; bundled: boolean; draft: CountDraft; setDraft: (d: CountDraft) => void; editable: boolean }) {
  const set = (k: keyof CountDraft) => (v: string) => setDraft({ ...draft, [k]: v });
  const mdl = num(draft.mdl);
  const bundles = bundled ? num(draft.bundles) : 1;
  const perCase = (bundles ?? 0) * (mdl ?? 0);
  const total = palletTotal({ mdl_actual: mdl, bundles_per_case: bundles, full_cases_count: num(draft.cases), partial_units: num(draft.loose) });
  const others = upc.received_units - pallet.total_units;
  const counted = others + total;
  const remaining = Math.max(0, upc.expected_units - counted);
  const mdlOk = mdl !== null && mdl === pallet.mdl_expected;

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">3. Count</h2>
          <p className="mt-1 text-sm text-muted-foreground">{bundled ? "Open one case from the current pallet. Count the units in one bundle, then count the bundles in the case. The app works out the totals for you." : "Open one case from the current pallet and count the units in it. The app works out the totals for you."}</p>
        </div>
        <div className="grid shrink-0 grid-cols-2 divide-x self-start rounded-2xl border bg-primary/8 text-center">
          <div className="px-3 py-2"><p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Total units</p><p className="text-2xl font-bold text-primary">{fmt(total)}</p></div>
          <div className="px-3 py-2"><p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Remaining</p><p className={`text-2xl font-bold ${remaining ? "text-warning-foreground" : "text-success"}`}>{fmt(remaining)}</p></div>
        </div>
      </div>

      {bundled ? (
        <>
          <div className="mt-4 rounded-2xl border bg-muted/30 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Part 1 — MDL (units per bundle) <InfoHint label="MDL" text={EXPLAIN.mdl} /></p>
            <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-end gap-2 [&_span.uppercase]:leading-tight">
              <div><p className="text-xs text-muted-foreground">MDL from PO</p><p className="text-3xl font-bold text-primary">{pallet.mdl_expected}</p></div>
              <span className="pb-3 text-muted-foreground">→</span>
              <NumberField label="Actual MDL (edit only if different)" value={draft.mdl} onChange={set("mdl")} disabled={!editable} />
            </div>
            {mdl !== null ? <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${mdlOk ? "bg-success/12 text-success" : "bg-warning/18 text-warning-foreground"}`}>{mdlOk ? "✓ MDL matches PO expectation — no changes needed." : `MDL differs from the PO (${pallet.mdl_expected}). Make sure ${mdl} is what you counted.`}</p> : null}
          </div>

          <div className="mt-3 rounded-2xl border p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Part 2 — Bundle count in case <InfoHint label="bundles in a case" text={EXPLAIN.bundles} /></p>
            <div className="mt-2 grid grid-cols-2 items-end gap-3 text-center sm:grid-cols-3 sm:gap-2">
              <div className="col-span-2 sm:col-span-1"><NumberField label="Bundles counted" value={draft.bundles} onChange={set("bundles")} disabled={!editable} hint={`PO says ${pallet.bundles_expected}`} /></div>
              <div><p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Units / bundle</p><p className="mt-3 text-lg font-semibold">{mdl ?? "-"}</p><p className="text-[11px] text-muted-foreground">(from Part 1)</p></div>
              <div><p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total units this case</p><p className="mt-3 text-2xl font-bold text-primary">{perCase}</p></div>
            </div>
            {bundles !== null && mdl !== null && bundles > 0 ? <p className="mt-2 rounded-lg bg-success/12 px-3 py-2 text-sm text-success">✓ {bundles} bundles × {mdl} units = {perCase} units for this case.</p> : null}
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-2xl border p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Part 1 — Units in one case <InfoHint label="units per case" text={EXPLAIN.perCase} /></p>
          <div className="mt-2 max-w-48"><NumberField label="Units counted" value={draft.mdl} onChange={set("mdl")} disabled={!editable} hint={`PO says ${pallet.mdl_expected * pallet.bundles_expected}`} /></div>
        </div>
      )}

      <div className="mt-3 rounded-2xl border p-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Part 3 — Full cases on this pallet <InfoHint label="full cases" text={EXPLAIN.cases} /></p>
        <p className="mt-1 text-xs text-muted-foreground">Count and enter the number of full, complete cases on this pallet. Do not include any oddball or incomplete case here.</p>
        <div className="mt-2 max-w-48"><NumberField label="Full cases" value={draft.cases} onChange={set("cases")} disabled={!editable} /></div>
      </div>

      <div className="mt-3 rounded-2xl border p-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Part 4 — Loose or partial units <InfoHint label="loose units" text={EXPLAIN.loose} /></p>
        <p className="mt-1 text-xs text-muted-foreground">Units not in a full case. Leave 0 if there are none.</p>
        <div className="mt-2 max-w-48"><NumberField label="Loose units" value={draft.loose} onChange={set("loose")} disabled={!editable} /></div>
      </div>

      <p className="mt-3 rounded-xl bg-primary/8 p-3 text-sm">Pallet total = {draft.cases || 0} cases × {perCase} units per case + {draft.loose || 0} loose = <strong>{fmt(total)}</strong> units.</p>
    </section>
  );
}

// ------------------------------------------------------------------ step 4

function StepLabels({ upc, pallet, checks, setChecks, editable, onAnother, onDone, busy }: { upc: UpcDetail; pallet: Pallet; checks: Record<CheckKey, boolean>; setChecks: Dispatch<SetStateAction<Record<CheckKey, boolean>>>; editable: boolean; onAnother: () => void; onDone: () => void; busy: boolean }) {
  const labelsOk = LABEL_CHECKS.every(([k]) => checks[k]);
  const variance = pallet.expected_units ? pallet.total_units - pallet.expected_units : 0;
  const cases = pallet.full_cases_count ?? 0;
  const perCase = (pallet.bundles_per_case ?? 0) * (pallet.mdl_actual ?? 0);
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="text-xl font-bold">4. Scan Labels</h2>
      <p className="mt-1 text-sm text-muted-foreground">Apply labels to all cases and the pallet, then confirm below. Once done, say whether there is another pallet for this UPC or mark it complete.</p>

      <div className="mt-4 overflow-hidden rounded-2xl border">
        <p className="bg-muted/60 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Label confirmation</p>
        <ul className="divide-y">
          {LABEL_CHECKS.map(([key]) => (
            <li key={key}>
              <button disabled={!editable} role="checkbox" aria-checked={checks[key]} onClick={() => setChecks((c) => ({ ...c, [key]: !c[key] }))} className="flex w-full items-center gap-3 px-3.5 py-3 text-left outline-none focus-visible:bg-muted/50 disabled:opacity-60">
                <span className={`grid size-6 shrink-0 place-items-center rounded-md border-2 ${checks[key] ? "border-success bg-success text-white" : "border-muted-foreground/40"}`}>{checks[key] ? <Check size={15} /> : null}</span>
                <span><span className="block text-sm font-semibold">{key === "label_pallet_confirmed" ? "Pallet label scanned" : "All case labels scanned"}</span><span className="block text-xs text-muted-foreground">{key === "label_pallet_confirmed" ? "The pallet label has been applied and scanned" : "Every case on this pallet has been labelled and scanned"}</span></span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 rounded-2xl border p-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pallet {pallet.position} summary — UPC {upc.upc_code}</p>
        <div className="mt-2 grid grid-cols-2 gap-3 text-center sm:grid-cols-4 sm:gap-2">
          {[
            ["Units this pallet", fmt(pallet.total_units), "text-primary"],
            ["Expected count", pallet.expected_units ? fmt(pallet.expected_units) : "-", ""],
            ["Remaining count", pallet.expected_units ? fmt(Math.max(0, pallet.expected_units - pallet.total_units)) : "-", ""],
            ["Total variance", pallet.expected_units ? `${variance > 0 ? "+" : ""}${fmt(variance)}` : "-", variance === 0 ? "text-success" : "text-destructive"],
          ].map(([label, value, tone]) => (
            <div key={label}><p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className={`text-lg font-bold ${tone}`}>{value}</p></div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{cases} cases × {pallet.bundles_per_case ?? 0} bundles × {pallet.mdl_actual ?? 0} MDL + {pallet.partial_units ?? 0} partial = {fmt(cases * perCase + (pallet.partial_units ?? 0))}</p>
      </div>

      <div className="mt-3 rounded-2xl border p-3.5">
        <p className="text-sm font-bold uppercase">Is there another pallet with this UPC?</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button size="lg" className="h-12" disabled={!editable || !labelsOk || busy} onClick={onAnother}>{busy ? <Loader2 className="animate-spin" /> : <RotateCcw />} Yes — start next pallet</Button>
          <Button size="lg" className="h-12 bg-success text-white hover:bg-success/90" disabled={!editable || !labelsOk || busy} onClick={onDone}>{busy ? <Loader2 className="animate-spin" /> : <Check />} No — done with this UPC</Button>
        </div>
        {!labelsOk ? <p className="mt-2 text-xs text-muted-foreground">Confirm both labels first.</p> : null}
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

  const productReady = PRODUCT_CHECKS.every(([k]) => checks[k]);
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
          <h2 className="text-sm font-semibold">Flag an exception</h2>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Reason">
            {(Object.keys(FLAG_REASONS) as FlagReason[]).map((key) => (
              <button key={key} role="radio" aria-checked={suggested === key} onClick={() => setReason(key)} className={`rounded-full border px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${suggested === key ? "border-transparent bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}>{FLAG_REASONS[key]}</button>
            ))}
          </div>
          <Textarea className="mt-3" rows={3} placeholder="Add a note for the supervisor (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setFlagOpen(false)} disabled={flag.isPending}>Cancel</Button>
            <Button variant="destructive" disabled={flag.isPending} onClick={() => flag.mutate({ id: upc.id, reason: suggested, note: note.trim() }, { onSuccess: () => { toast.success("Flagged for the supervisor"); onToUpcs(); }, onError: fail })}>{flag.isPending ? <Loader2 className="animate-spin" /> : null} Submit flag</Button>
          </div>
        </section>
      ) : null}

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 -mx-1 rounded-2xl border bg-background/90 p-2 shadow-lg backdrop-blur-xl">
        <div className="grid grid-cols-[1fr_auto_1.4fr] gap-2">
          <Button variant="outline" className="h-12 min-w-0 px-3" onClick={() => (step === 2 ? onToUpcs() : setStep((step - 1) as Step))}><ChevronLeft className="shrink-0" /> <span className="truncate"><span className="sm:hidden">Back</span><span className="hidden sm:inline">{step === 2 ? "Back to UPCs" : step === 3 ? "Back: product" : "Back: count"}</span></span></Button>
          <Button variant="outline" className="h-12 border-destructive/40 text-destructive hover:bg-destructive/10" disabled={!editable} onClick={() => setFlagOpen(true)}><AlertTriangle className="shrink-0" /> <span className="hidden sm:inline">Flag</span></Button>
          {step === 2 ? <Button className="h-12 min-w-0 px-3" disabled={!editable || !productReady || busy} onClick={acceptProduct}>{busy ? <Loader2 className="animate-spin" /> : null} <span className="truncate"><span className="sm:hidden">Next</span><span className="hidden sm:inline">Accept &amp; next: Count</span></span> <ChevronRight className="shrink-0" /></Button> : null}
          {step === 3 ? <Button className="h-12 min-w-0 px-3" disabled={!editable || !countReady || busy} onClick={acceptCount}>{busy ? <Loader2 className="animate-spin" /> : null} <span className="truncate"><span className="sm:hidden">Next</span><span className="hidden sm:inline">Accept count → Labels</span></span> <ChevronRight className="shrink-0" /></Button> : null}
          {step === 4 ? <span className="self-center px-2 text-center text-xs text-muted-foreground">Choose yes or no above</span> : null}
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
            <PalletFlow key={pallet.id} upc={upc} pallet={pallet} step={step} setStep={setStep} onPallet={setPalletId} onToUpcs={toUpcs} />
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
