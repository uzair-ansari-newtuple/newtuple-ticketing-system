"use client";

import { CheckCircle2, ChevronRight, Loader2, MapPin, Package, Truck } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Reveal, StaggerList, StaggerListItem } from "@/components/motion";
import { LineStatusBadge, PoStatusBadge } from "@/components/qc-badges";
import { QueryError } from "@/components/query-error";
import { SafeImg } from "@/components/safe-img";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { productImageUrl } from "@/data/catalog";
import { percentDone } from "@/lib/qc/progress";
import { useQcMutations, useQcPo } from "@/lib/qc/queries";

export default function PoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: po, isLoading, isError, error, refetch } = useQcPo(id);
  const { start } = useQcMutations();

  if (isLoading) {
    return (
      <AppShell title="Purchase order" back="/qc" area="qc">
        <Skeleton className="h-40 w-full rounded-2xl" />
      </AppShell>
    );
  }
  if (isError || !po) {
    return (
      <AppShell title="Purchase order" back="/qc" area="qc">
        <QueryError error={error ?? new Error("Purchase order not found")} onRetry={refetch} />
      </AppShell>
    );
  }

  const t = po.totals;
  const inProgress = po.state === "QC_IN_PROGRESS";
  const canComplete = inProgress && t.pending === 0;

  const footer =
    po.state === "FETCHED" ? (
      <Button size="lg" className="h-12 w-full text-base" disabled={start.isPending} onClick={() => start.mutate([po.id], { onError: (e) => toast.error(e.message) })}>
        {start.isPending ? <Loader2 className="animate-spin" /> : null} Start QC
      </Button>
    ) : inProgress ? (
      <Button size="lg" className="h-12 w-full text-base" disabled={!canComplete} onClick={() => router.push(`/qc/po/${po.id}/complete`)}>
        {canComplete ? "Complete QC" : `${t.pending} UPC${t.pending === 1 ? "" : "s"} left to verify`}
      </Button>
    ) : undefined;

  return (
    <AppShell title={po.number} subtitle={po.supplier} back="/qc" area="qc" footer={footer}>
      <Reveal className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <PoStatusBadge state={po.state} />
          <span className="text-xs text-muted-foreground">Shipment {po.shipment.id}</span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-start gap-2"><Truck size={16} className="mt-0.5 text-primary" /><div><dt className="text-xs text-muted-foreground">Carrier</dt><dd className="font-medium">{po.shipment.carrier}</dd></div></div>
          <div className="flex items-start gap-2"><Package size={16} className="mt-0.5 text-primary" /><div><dt className="text-xs text-muted-foreground">Trailer</dt><dd className="font-medium">{po.shipment.trailer}</dd></div></div>
        </dl>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>{t.lines - t.pending} of {t.lines} UPCs checked</span>
            <span>{t.exceptions ? `${t.exceptions} exception${t.exceptions === 1 ? "" : "s"}` : "No exceptions"}</span>
          </div>
          <Progress value={percentDone(t)} className="h-2" />
        </div>
      </Reveal>

      {po.state === "QC_COMPLETE" ? <div className="mt-4 flex items-center gap-2 rounded-xl bg-success/12 p-3 text-sm font-medium text-success"><CheckCircle2 size={18} /> QC complete for this purchase order.</div> : null}
      {po.state === "EXCEPTIONS_OPEN" ? <div className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">QC is done. {t.open_exceptions} open {t.open_exceptions === 1 ? "exception needs" : "exceptions need"} a supervisor on the Exceptions tab.</div> : null}

      {po.pallets.map((pallet) => (
        <section key={pallet.id} className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">{pallet.name}{pallet.state === "CHECKED" ? <CheckCircle2 size={14} className="text-success" /> : null}</h2>
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={12} /> {pallet.position}</span>
          </div>
          <StaggerList className="space-y-2">
            {po.lines.filter((l) => l.pallet === pallet.name).map((line) => {
              const row = (
                <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
                  <SafeImg src={productImageUrl(line.sku)} className="size-14 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{line.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{line.upc}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <LineStatusBadge state={line.state} />
                      <span className="text-xs text-muted-foreground">{line.received_qty !== null ? `${line.received_qty} of ${line.expected_qty}` : `Expected ${line.expected_qty}`}</span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
                </div>
              );
              return (
                <StaggerListItem key={line.id}>
                  {po.state === "FETCHED" ? row : <Link href={`/qc/po/${po.id}/line/${line.id}`} className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{row}</Link>}
                </StaggerListItem>
              );
            })}
          </StaggerList>
        </section>
      ))}
    </AppShell>
  );
}
