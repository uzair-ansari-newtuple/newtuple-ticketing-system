"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Reveal, StaggerList, StaggerListItem } from "@/components/motion";
import { ShipmentBadge, UpcBadge } from "@/components/qc-badges";
import { QcWizard } from "@/components/qc-wizard";
import { QueryError } from "@/components/query-error";
import { SafeImg } from "@/components/safe-img";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { productImageUrl } from "@/data/catalog";
import { percentDone } from "@/lib/qc/progress";
import { useQcMutations, useShipment } from "@/lib/qc/queries";

export default function ShipmentPage() {
  const { id } = useParams<{ id: string }>();
  const { data: shipment, isLoading, isError, error, refetch } = useShipment(id);
  const { start, receipt } = useQcMutations();
  const [confirmation, setConfirmation] = useState("");
  const [returnNote, setReturnNote] = useState("");

  if (isLoading) return <AppShell title="Shipment" back="/qc" area="qc"><Skeleton className="h-40 w-full rounded-2xl" /></AppShell>;
  if (isError || !shipment) return <AppShell title="Shipment" back="/qc" area="qc"><QueryError error={error ?? new Error("Shipment not found")} onRetry={refetch} /></AppShell>;

  if (shipment.state === "IN_PROGRESS") return <QcWizard shipment={shipment} />;

  const t = shipment.totals;
  const fail = (e: Error) => toast.error(e.message);

  const footer =
    shipment.state === "CREATED" ? (
      <Button size="lg" className="h-12 w-full text-base" disabled={start.isPending} onClick={() => start.mutate([shipment.id], { onError: fail })}>
        {start.isPending ? <Loader2 className="animate-spin" /> : null} Start QC
      </Button>
    ) : undefined;

  return (
    <AppShell title={shipment.po_number} subtitle={shipment.vendor_name} back="/qc" area="qc" footer={footer}>
      <Reveal className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <ShipmentBadge state={shipment.state} />
          <span className="text-xs text-muted-foreground">{shipment.shipment_number} · {shipment.dc_id}</span>
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>{t.approved + t.wont_qc} of {t.upcs} UPCs done</span>
            <span>{t.on_hold ? `${t.on_hold} on hold` : "None on hold"}</span>
          </div>
          <Progress value={percentDone(t)} className="h-2" />
        </div>
      </Reveal>

      {shipment.state === "QC_COMPLETE" || shipment.state === "RECEIPT_IN_PROGRESS" || shipment.state === "CLOSED" ? (
        <section className="mt-4 rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 size={16} className="text-success" /> QC is complete</h2>
          {shipment.state === "QC_COMPLETE" ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button disabled={receipt.isPending} onClick={() => receipt.mutate({ id, action: "start" }, { onError: fail })}>Start receipt</Button>
              <Button variant="outline" disabled={receipt.isPending} onClick={() => receipt.mutate({ id, action: "return", note: returnNote }, { onError: fail })}>Return to associate</Button>
            </div>
          ) : shipment.state === "RECEIPT_IN_PROGRESS" ? (
            <div className="mt-3 space-y-2">
              <input className="h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" placeholder="Receipt confirmation number" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Button disabled={!confirmation.trim() || receipt.isPending} onClick={() => receipt.mutate({ id, action: "close", confirmation_number: confirmation }, { onError: fail })}>Close receipt</Button>
                <Button variant="outline" disabled={receipt.isPending} onClick={() => receipt.mutate({ id, action: "return", note: returnNote }, { onError: fail })}>Return to associate</Button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Receipt closed with confirmation {shipment.confirmation_number}.</p>
          )}
          {shipment.state !== "CLOSED" ? <Textarea className="mt-3" rows={2} placeholder="Note if returning to the associate (optional)" value={returnNote} onChange={(e) => setReturnNote(e.target.value)} /> : null}
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">UPCs</h2>
        <StaggerList className="space-y-2">
          {shipment.upcs.map((u) => {
            const row = (
              <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
                <SafeImg src={productImageUrl(u.upc_code)} className="size-14 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{u.description}</p>
                  <p className="font-mono text-xs text-muted-foreground">{u.upc_code} · {u.style_number}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <UpcBadge state={u.state} />
                    <span className="text-xs text-muted-foreground">{u.received_units ? `Counted ${u.received_units} · PO says ${u.expected_units}` : `PO says ${u.expected_units} units`}</span>
                  </div>
                </div>
                </div>
            );
            return (
              <StaggerListItem key={u.id}>
                {row}
              </StaggerListItem>
            );
          })}
        </StaggerList>
      </section>
    </AppShell>
  );
}
