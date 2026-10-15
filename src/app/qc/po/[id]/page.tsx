"use client";

import { CheckCircle2, ChevronRight, MapPin, Package, Truck } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Reveal, StaggerList, StaggerListItem } from "@/components/motion";
import { LineStatusBadge, PoStatusBadge } from "@/components/qc-badges";
import { SafeImg } from "@/components/safe-img";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { productImageUrl } from "@/data/catalog";
import { poSummary } from "@/lib/qc/progress";
import { lineStatus, useQc } from "@/store/qc";

export default function PoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const po = useQc((s) => s.pos.find((p) => p.id === id));
  const progress = useQc((s) => s.progress[id]);
  const startQc = useQc((s) => s.startQc);

  if (!po) {
    return (
      <AppShell title="Purchase order" back="/qc" area="qc">
        <p className="mt-10 text-center text-sm text-muted-foreground">This purchase order is not on this device. Fetch POs again from the list.</p>
      </AppShell>
    );
  }

  const status = progress?.status ?? "FETCHED";
  const s = poSummary(po, progress);
  const canComplete = status === "IN_PROGRESS" && s.pending === 0;

  const footer =
    status === "FETCHED" ? (
      <Button size="lg" className="h-12 w-full text-base" onClick={() => startQc([po.id])}>Start QC</Button>
    ) : status === "IN_PROGRESS" ? (
      <Button size="lg" className="h-12 w-full text-base" disabled={!canComplete} onClick={() => router.push(`/qc/po/${po.id}/complete`)}>
        {canComplete ? "Complete QC" : `${s.pending} UPC${s.pending === 1 ? "" : "s"} left to verify`}
      </Button>
    ) : undefined;

  return (
    <AppShell title={po.number} subtitle={po.supplier} back="/qc" area="qc" footer={footer}>
      <Reveal className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <PoStatusBadge status={status} />
          <span className="text-xs text-muted-foreground">Shipment {po.shipment.id}</span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-start gap-2"><Truck size={16} className="mt-0.5 text-primary" /><div><dt className="text-xs text-muted-foreground">Carrier</dt><dd className="font-medium">{po.shipment.carrier}</dd></div></div>
          <div className="flex items-start gap-2"><Package size={16} className="mt-0.5 text-primary" /><div><dt className="text-xs text-muted-foreground">Trailer</dt><dd className="font-medium">{po.shipment.trailer}</dd></div></div>
        </dl>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{s.handled} of {s.total} UPCs checked</span><span>{s.exceptions ? `${s.exceptions} exception${s.exceptions === 1 ? "" : "s"}` : "No exceptions"}</span></div>
          <Progress value={s.percent} className="h-2" />
        </div>
      </Reveal>

      {status === "COMPLETE" ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-success/12 p-3 text-sm font-medium text-success"><CheckCircle2 size={18} /> QC complete for this purchase order.</div>
      ) : null}

      {po.pallets.map((pallet) => (
        <section key={pallet.id} className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{pallet.id}</h2>
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={12} /> {pallet.position}</span>
          </div>
          <StaggerList className="space-y-2">
            {po.lines.filter((l) => l.palletId === pallet.id).map((line) => {
              const st = lineStatus(progress, line.upc);
              const result = progress?.results[line.upc];
              const row = (
                <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
                  <SafeImg src={productImageUrl(line.sku)} className="size-14 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{line.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{line.upc}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <LineStatusBadge status={st} />
                      <span className="text-xs text-muted-foreground">{result ? `${result.receivedQty} of ${line.expectedQty}` : `Expected ${line.expectedQty}`}</span>
                    </div>
                  </div>
                  {status === "IN_PROGRESS" ? <ChevronRight size={18} className="shrink-0 text-muted-foreground" /> : null}
                </div>
              );
              return (
                <StaggerListItem key={line.upc}>
                  {status === "IN_PROGRESS" ? <Link href={`/qc/po/${po.id}/upc/${line.upc}`} className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{row}</Link> : row}
                </StaggerListItem>
              );
            })}
          </StaggerList>
        </section>
      ))}
    </AppShell>
  );
}
