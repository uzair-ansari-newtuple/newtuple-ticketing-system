"use client";

import { Barcode, Check, ClipboardList, Loader2, RotateCcw, ScanSearch, Ticket, Truck, TriangleAlert, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDemoReset, useDemoStatus, useReindex } from "@/lib/demo/queries";
import type { ResetSummary } from "@/lib/demo/reset";

const STATE_LABEL: Record<string, string> = {
  CREATED: "Created", IN_PROGRESS: "In progress", QC_COMPLETE: "QC complete", RECEIPT_IN_PROGRESS: "Receipt in progress", CLOSED: "Closed",
  PENDING: "Pending", SUPERVISOR_HOLD: "Supervisor hold", APPROVED: "Approved", WONT_QC: "Won't QC",
  CAPTURED: "Captured", IMAGE_MAPPED: "Image mapped", AI_IDENTIFICATION: "Identifying", NEW: "New", INPROGRESS: "In progress", RESOLVED: "Resolved",
  NOT_CT_MERCH: "Not our item", CANT_RESOLVE: "Can't resolve", NEEDS_L2: "Needs L2",
};

const SHADES = ["bg-primary", "bg-primary/70", "bg-primary/45", "bg-primary/25", "bg-primary/12"];
const iconFor = (name: string): LucideIcon => (/shipment/i.test(name) ? Truck : /upc/i.test(name) ? Barcode : /incident|ticket/i.test(name) ? Ticket : ClipboardList);

function StatusCard({ name, total, byState }: { name: string; total: number; byState: Record<string, number> }) {
  const Icon = iconFor(name);
  const rows = Object.entries(byState).sort((a, b) => b[1] - a[1]);
  return (
    <section className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/30 text-primary"><Icon size={18} /></span>
        <h2 className="min-w-0 truncate text-sm font-semibold tracking-tight" title={name}>{name}</h2>
      </div>
      <p className="mt-4 flex items-baseline gap-2"><span className="text-4xl font-light leading-none tabular-nums">{total}</span><span className="text-sm text-muted-foreground">{total === 1 ? "record" : "records"}</span></p>
      {rows.length ? (
        <>
          <div className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={rows.map(([k, n]) => `${STATE_LABEL[k] ?? k} ${n}`).join(", ")}>
            {rows.map(([k, n], i) => <span key={k} className={SHADES[Math.min(i, SHADES.length - 1)]} style={{ width: `${(n / total) * 100}%` }} />)}
          </div>
          <ul className="mt-4 space-y-1.5 text-sm">
            {rows.map(([k, n], i) => (
              <li key={k} className="flex items-center gap-2.5">
                <span className={`size-2 shrink-0 rounded-full ${SHADES[Math.min(i, SHADES.length - 1)]}`} />
                <span className="flex-1 text-muted-foreground">{STATE_LABEL[k] ?? k}</span>
                <span className="font-medium tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
        </>
      ) : <p className="mt-4 text-sm text-muted-foreground">Nothing here yet</p>}
    </section>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Summary({ s }: { s: ResetSummary }) {
  const recreated = s.shipments.recreated + s.upcs.recreated;
  return (
    <div className="rounded-2xl border border-success/40 bg-success/10 p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold text-success"><Check size={16} /> Demo is back at the start</p>
      <ul className="mt-2 space-y-1 text-foreground/80">
        <li>Reset in place: {plural(s.shipments.reset, "shipment")}, {plural(s.upcs.reset, "UPC")}, {plural(s.tickets.reset, "ticket")}.</li>
        {s.tickets.deleted ? <li>Removed because they were resolved: {plural(s.tickets.deleted, "ticket")}.</li> : null}
        {recreated ? <li>Made again because they were finished: {plural(s.shipments.recreated, "shipment")}, {plural(s.upcs.recreated, "UPC")}.</li> : null}
        <li>Cleared: {plural(s.cleared.pallets, "pallet")}, {plural(s.cleared.flags, "flag")}, {plural(s.cleared.notifications, "notification")}, {plural(s.cleared.photos, "photo")}.</li>
        {s.loaded.length ? <li>Loaded sample shipments: {s.loaded.join(", ")}.</li> : null}
      </ul>
      {s.warnings.length ? <p className="mt-2 text-warning-foreground">{plural(s.warnings.length, "thing")} could not be cleared: {s.warnings.slice(0, 3).join("; ")}</p> : null}
    </div>
  );
}

export default function DemoCockpitPage() {
  const status = useDemoStatus();
  const reset = useDemoReset();
  const reindex = useReindex();
  const [typed, setTyped] = useState("");
  const [summary, setSummary] = useState<ResetSummary | null>(null);
  const ready = typed.trim().toUpperCase() === "RESET";

  function run() {
    setSummary(null);
    reset.mutate(undefined, {
      onSuccess: (s) => {
        setSummary(s);
        setTyped("");
      },
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <AppShell title="Demo cockpit" subtitle="Put the demo back at the start, so you can run it again." area="hub" back="/apps">
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {status.data
            ? status.data.workflows.map((w) => <StatusCard key={w.name} name={w.name} total={w.total} byState={w.byState} />)
            : [0, 1, 2].map((i) => <Skeleton key={i} className="h-60 rounded-2xl" />)}
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
          <section className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-destructive/30 text-destructive"><RotateCcw size={20} /></span>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Reset demo</h2>
                <p className="text-sm text-muted-foreground">Back to the start, ready for the next run.</p>
              </div>
            </div>
            <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
              {[
                "Shipments go back to Created and UPCs to Pending. Counts, checks, photos and flags are cleared.",
                "Tickets go back to Captured. What the store photographed stays.",
                "Finished records are made again from the sample data.",
                "The product catalog and the sample photos are not touched.",
              ].map((t) => (
                <li key={t} className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-primary" />{t}</li>
              ))}
            </ul>
            <p className="mt-5 flex items-center gap-2 rounded-xl bg-warning/15 px-4 py-3 text-sm text-warning-foreground"><TriangleAlert size={16} className="shrink-0" /> This clears what everyone has done in the demo so far.</p>
            <label className="mt-5 block text-xs font-medium uppercase tracking-wider text-muted-foreground" htmlFor="confirm-reset">Type RESET to confirm</label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <Input id="confirm-reset" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="RESET" autoComplete="off" className="h-11 sm:flex-1" disabled={reset.isPending} />
              <Button variant="destructive" size="lg" className="h-11 sm:px-6" disabled={!ready || reset.isPending} onClick={run}>
                {reset.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />} {reset.isPending ? "Resetting…" : "Reset demo"}
              </Button>
            </div>
            {reset.isPending ? <p className="mt-2 text-xs text-muted-foreground">This takes a moment.</p> : null}
          </section>

          <div className="space-y-4">
            {summary ? <Summary s={summary} /> : null}
            <section className="rounded-2xl border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/30 text-primary"><ScanSearch size={20} /></span>
                <h2 className="text-lg font-semibold tracking-tight">Rebuild image index</h2>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">Makes the image vector of every catalog product again with the model the app uses now. Run it once after the image model changes, so photos can be matched.</p>
              <Button variant="outline" size="lg" className="mt-5 h-11 w-full" disabled={reindex.isPending} onClick={() => reindex.mutate(undefined, { onSuccess: (r) => toast.success(`Rebuilt ${r.updated} items with ${r.model}${r.failed.length ? `, ${r.failed.length} failed` : ""}`), onError: (e) => toast.error(e.message) })}>
                {reindex.isPending ? <Loader2 className="animate-spin" /> : <ScanSearch />} {reindex.isPending ? "Rebuilding, this takes a minute…" : "Rebuild image index"}
              </Button>
              {reindex.data?.failed.length ? <p className="mt-2 text-sm text-warning-foreground">Could not rebuild: {reindex.data.failed.slice(0, 3).join("; ")}</p> : null}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
