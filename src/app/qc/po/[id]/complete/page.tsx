"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Reveal } from "@/components/motion";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQcMutations, useShipment } from "@/lib/qc/queries";

export default function CompleteQcPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: shipment, isLoading, isError, error, refetch } = useShipment(id);
  const { complete } = useQcMutations();

  if (isLoading) return <AppShell title="QC summary" back={`/qc/po/${id}`} area="qc"><Skeleton className="h-24 w-full rounded-2xl" /></AppShell>;
  if (isError || !shipment) return <AppShell title="QC summary" back="/qc" area="qc"><QueryError error={error ?? new Error("Shipment not found")} onRetry={refetch} /></AppShell>;

  const t = shipment.totals;
  const ready = shipment.state === "IN_PROGRESS" && t.blocking === 0;

  function submit() {
    complete.mutate(id, {
      onSuccess: () => {
        toast.success(`${shipment!.po_number} QC complete`);
        router.replace("/qc");
      },
      onError: (e) => toast.error(e.message),
    });
  }

  const footer = shipment.state === "IN_PROGRESS" ? (
    <Button size="lg" className="h-12 w-full text-base" disabled={!ready || complete.isPending} onClick={submit}>
      {complete.isPending ? <Loader2 className="animate-spin" /> : null}
      {ready ? "Submit QC" : `${t.blocking} UPC${t.blocking === 1 ? "" : "s"} still blocking`}
    </Button>
  ) : undefined;

  return (
    <AppShell title="Review and submit" subtitle={`${shipment.po_number} · ${shipment.vendor_name}`} back={`/qc/po/${id}`} area="qc" footer={footer}>
      <Reveal className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "UPCs approved", value: t.approved, tone: "text-success" },
          { label: "UPCs skipped", value: t.wont_qc, tone: "text-foreground" },
          { label: "Units counted / expected", value: `${t.received}/${t.units}`, tone: "text-foreground" },
        ].map((m) => (
          <div key={m.label} className="rounded-2xl border bg-card p-3 shadow-sm">
            <p className={`text-2xl font-bold ${m.tone}`}>{m.value}</p>
            <p className="text-xs text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </Reveal>
      {ready ? (
        <div className="mt-6 flex items-center gap-2 rounded-xl bg-success/12 p-3 text-sm font-medium text-success"><CheckCircle2 size={18} /> Every UPC is approved or skipped. Submit QC to send this PO on to receipt.</div>
      ) : (
        <p className="mt-6 text-center text-sm text-muted-foreground">{shipment.state === "IN_PROGRESS" ? "Some UPCs are not finished. Go back and finish them first." : "QC for this shipment was already submitted."}</p>
      )}
    </AppShell>
  );
}
