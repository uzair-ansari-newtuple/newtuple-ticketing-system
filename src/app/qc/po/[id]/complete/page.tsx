"use client";

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Reveal } from "@/components/motion";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useQcMutations, useQcPo } from "@/lib/qc/queries";
import { EXCEPTION_REASONS } from "@/lib/qc/types";

export default function CompleteQcPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: po, isLoading, isError, error, refetch } = useQcPo(id);
  const { complete } = useQcMutations();
  const [note, setNote] = useState("");

  if (isLoading) return <AppShell title="QC summary" back={`/qc/po/${id}`} area="qc"><Skeleton className="h-24 w-full rounded-2xl" /></AppShell>;
  if (isError || !po) return <AppShell title="QC summary" back="/qc" area="qc"><QueryError error={error ?? new Error("Purchase order not found")} onRetry={refetch} /></AppShell>;

  const t = po.totals;
  const ready = po.state === "QC_IN_PROGRESS" && t.pending === 0;
  const exceptions = po.lines.filter((l) => l.exception);

  function submit() {
    complete.mutate(
      { id, note: note.trim() || undefined },
      {
        onSuccess: (res) => {
          toast.success(res.state === "EXCEPTIONS_OPEN" ? `${po!.number} done, exceptions need review` : `${po!.number} QC complete`);
          router.replace(res.state === "EXCEPTIONS_OPEN" ? "/qc/exceptions" : "/qc");
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  const footer = po.state === "QC_IN_PROGRESS" ? (
    <Button size="lg" className="h-12 w-full text-base" disabled={!ready || complete.isPending} onClick={submit}>
      {complete.isPending ? <Loader2 className="animate-spin" /> : null}
      {ready ? (t.open_exceptions ? "Submit with exceptions" : "Submit QC complete") : `${t.pending} UPC${t.pending === 1 ? "" : "s"} still to verify`}
    </Button>
  ) : undefined;

  return (
    <AppShell title="QC summary" subtitle={`${po.number} · ${po.supplier}`} back={`/qc/po/${id}`} area="qc" footer={footer}>
      <Reveal className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Verified", value: t.verified, tone: "text-success" },
          { label: "Exceptions", value: t.exceptions, tone: t.exceptions ? "text-destructive" : "text-foreground" },
          { label: "Units received", value: `${t.received}/${t.units}`, tone: "text-foreground" },
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
            {exceptions.map((l) => (
              <li key={l.id} className="rounded-xl border bg-card p-3 text-sm shadow-sm">
                <p className="font-medium">{l.name} <span className="font-mono text-xs text-muted-foreground">{l.upc}</span></p>
                <p className="text-muted-foreground">{EXCEPTION_REASONS[l.exception!.reason]} · received {l.received_qty} of {l.expected_qty}</p>
                {l.exception!.note ? <p className="mt-1">{l.exception!.note}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="mt-6 flex items-center gap-2 rounded-xl bg-success/12 p-3 text-sm font-medium text-success"><CheckCircle2 size={18} /> Every UPC matched the PO.</div>
      )}

      {po.state === "QC_IN_PROGRESS" ? <Textarea className="mt-6" rows={3} placeholder="Add a note to the QC summary (optional)" value={note} onChange={(e) => setNote(e.target.value)} /> : <p className="mt-6 text-center text-sm text-muted-foreground">QC on this purchase order is already finished.</p>}
    </AppShell>
  );
}
