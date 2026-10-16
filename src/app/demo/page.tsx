"use client";

import { Check, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDemoReset, useDemoStatus } from "@/lib/demo/queries";
import type { ResetSummary } from "@/lib/demo/reset";

const STATE_LABEL: Record<string, string> = {
  CREATED: "Created", IN_PROGRESS: "In progress", QC_COMPLETE: "QC complete", RECEIPT_IN_PROGRESS: "Receipt in progress", CLOSED: "Closed",
  PENDING: "Pending", SUPERVISOR_HOLD: "Supervisor hold", APPROVED: "Approved", WONT_QC: "Won't QC",
  CAPTURED: "Captured", IMAGE_MAPPED: "Image mapped", AI_IDENTIFICATION: "Identifying", NEW: "New", INPROGRESS: "In progress", RESOLVED: "Resolved",
  NOT_CT_MERCH: "Not our item", CANT_RESOLVE: "Can't resolve", NEEDS_L2: "Needs L2",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Summary({ s }: { s: ResetSummary }) {
  const recreated = s.shipments.recreated + s.upcs.recreated;
  return (
    <div className="rounded-2xl border border-success/40 bg-success/10 p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold text-success"><Check size={16} /> Demo is back at the start</p>
      <ul className="mt-2 space-y-1 text-foreground/80">
        <li>Reset in place: {plural(s.shipments.reset, "shipment")}, {plural(s.upcs.reset, "UPC")}, {plural(s.tickets.reset, "ticket")}.</li>
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
  const [typed, setTyped] = useState("");
  const [summary, setSummary] = useState<ResetSummary | null>(null);
  const ready = typed.trim().toUpperCase() === "RESET";

  function run() {
    setSummary(null);
    reset.mutate(undefined, {
      onSuccess: (s) => {
        setSummary(s);
        setTyped("");
        toast.success("Demo reset");
      },
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <AppShell title="Demo cockpit" subtitle="Put the demo back at the start, so you can run it again." area="hub" back="/apps">
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          {status.data
            ? status.data.workflows.map((w) => (
                <section key={w.name} className="rounded-2xl border bg-card p-4 shadow-sm">
                  <h2 className="text-sm font-semibold">{w.name}</h2>
                  <p className="mt-1 text-3xl font-bold">{w.total}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Object.entries(w.byState).length ? Object.entries(w.byState).map(([state, n]) => (
                      <span key={state} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{STATE_LABEL[state] ?? state} · {n}</span>
                    )) : <span className="text-xs text-muted-foreground">Nothing here yet</span>}
                  </div>
                </section>
              ))
            : [0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>

        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="text-base font-bold">Reset demo</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>• Shipments go back to Created and UPCs to Pending. Counts, checks, photos and flags are cleared.</li>
            <li>• Tickets go back to Captured. What the store photographed stays.</li>
            <li>• Finished records are made again from the sample data.</li>
            <li>• The product catalog and the sample photos are not touched.</li>
          </ul>
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-warning/15 p-3 text-sm text-warning-foreground"><TriangleAlert size={16} className="mt-0.5 shrink-0" /> This clears what everyone has done in the demo so far.</p>
          <label className="mt-4 block text-sm font-medium" htmlFor="confirm-reset">Type RESET to confirm</label>
          <Input id="confirm-reset" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="RESET" autoComplete="off" className="mt-1.5 h-11" disabled={reset.isPending} />
          <Button variant="destructive" size="lg" className="mt-3 h-12 w-full" disabled={!ready || reset.isPending} onClick={run}>
            {reset.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />} {reset.isPending ? "Resetting, this takes a moment…" : "Reset demo"}
          </Button>
        </section>

        {summary ? <Summary s={summary} /> : null}
      </div>
    </AppShell>
  );
}
