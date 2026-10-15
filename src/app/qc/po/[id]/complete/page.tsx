"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Reveal } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { poSummary } from "@/lib/qc/progress";
import { EXCEPTION_REASONS } from "@/lib/qc/types";
import { useQc } from "@/store/qc";

export default function CompleteQcPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const po = useQc((s) => s.pos.find((p) => p.id === id));
  const progress = useQc((s) => s.progress[id]);
  const completePo = useQc((s) => s.completePo);

  if (!po) {
    return (
      <AppShell title="QC complete" back="/qc" area="qc">
        <p className="mt-10 text-center text-sm text-muted-foreground">This purchase order is not on this device.</p>
      </AppShell>
    );
  }

  const s = poSummary(po, progress);
  const done = progress?.status === "COMPLETE";
  const ready = progress?.status === "IN_PROGRESS" && s.pending === 0;
  const exceptions = po.lines.filter((l) => progress?.results[l.upc]?.exception);

  function submit() {
    completePo(id);
    toast.success(`${po!.number} QC complete`);
    router.replace("/qc");
  }

  const footer = done ? undefined : (
    <Button size="lg" className="h-12 w-full text-base" disabled={!ready} onClick={submit}>
      {ready ? "Submit QC complete" : `${s.pending} UPC${s.pending === 1 ? "" : "s"} still to verify`}
    </Button>
  );

  return (
    <AppShell title="QC summary" subtitle={`${po.number} · ${po.supplier}`} back={`/qc/po/${id}`} area="qc" footer={footer}>
      <Reveal className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Verified", value: s.verified, tone: "text-success" },
          { label: "Exceptions", value: s.exceptions, tone: s.exceptions ? "text-destructive" : "text-foreground" },
          { label: "Units received", value: `${s.received}/${s.units}`, tone: "text-foreground" },
        ].map((m) => (
          <div key={m.label} className="rounded-2xl border bg-card p-3 shadow-sm">
            <p className={`text-2xl font-bold ${m.tone}`}>{m.value}</p>
            <p className="text-xs text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </Reveal>

      {exceptions.length ? (
        <section className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><AlertTriangle size={15} className="text-destructive" /> Exceptions to review</h2>
          <ul className="space-y-2">
            {exceptions.map((l) => {
              const r = progress!.results[l.upc];
              return (
                <li key={l.upc} className="rounded-xl border bg-card p-3 text-sm shadow-sm">
                  <p className="font-medium">{l.name} <span className="font-mono text-xs text-muted-foreground">{l.upc}</span></p>
                  <p className="text-muted-foreground">{EXCEPTION_REASONS[r.exception!.reason]} · received {r.receivedQty} of {l.expectedQty}</p>
                  {r.exception!.note ? <p className="mt-1">{r.exception!.note}</p> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <div className="mt-6 flex items-center gap-2 rounded-xl bg-success/12 p-3 text-sm font-medium text-success"><CheckCircle2 size={18} /> Every UPC matched the PO.</div>
      )}
      {done ? <p className="mt-6 text-center text-sm text-muted-foreground">This purchase order has already been completed.</p> : null}
    </AppShell>
  );
}
