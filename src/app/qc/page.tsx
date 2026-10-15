"use client";

import { ChevronRight, ClipboardList, Loader2, PackageSearch, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Reveal, StaggerList, StaggerListItem } from "@/components/motion";
import { PoStatusBadge } from "@/components/qc-badges";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { poSummary } from "@/lib/qc/progress";
import { useQc } from "@/store/qc";

export default function QcHomePage() {
  const router = useRouter();
  const { pos, progress, selected, fetchPos, toggleSelected, startQc } = useQc();
  const [fetching, setFetching] = useState(false);

  async function fetchFromSource() {
    setFetching(true);
    await new Promise((r) => setTimeout(r, 900));
    fetchPos();
    setFetching(false);
    toast.success("Purchase orders fetched");
  }

  function start() {
    const ids = [...selected];
    startQc(ids);
    router.push(`/qc/po/${ids[0]}`);
  }

  const footer = selected.length ? (
    <Button size="lg" className="h-12 w-full text-base" onClick={start}>
      Start QC · {selected.length} {selected.length === 1 ? "PO" : "POs"}
    </Button>
  ) : undefined;

  return (
    <AppShell title="Purchase orders" subtitle="Choose the POs to check" area="qc" footer={footer}>
      {pos.length === 0 ? (
        <Reveal className="mt-10 flex flex-col items-center gap-4 text-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary"><PackageSearch size={30} /></span>
          <div>
            <p className="font-semibold">No purchase orders yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Fetch the POs that arrived at the DC to begin.</p>
          </div>
          <Button size="lg" onClick={fetchFromSource} disabled={fetching}>
            {fetching ? <Loader2 className="animate-spin" /> : <RefreshCw />} Fetch POs
          </Button>
        </Reveal>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{pos.length} purchase orders</p>
            <Button variant="outline" size="sm" onClick={fetchFromSource} disabled={fetching}>
              {fetching ? <Loader2 className="animate-spin" /> : <RefreshCw />} Fetch POs
            </Button>
          </div>
          <StaggerList className="space-y-2.5">
            {pos.map((po) => {
              const p = progress[po.id];
              const s = poSummary(po, p);
              const status = p?.status ?? "FETCHED";
              const complete = status === "COMPLETE";
              return (
                <StaggerListItem key={po.id}>
                  <div className="flex items-stretch gap-3 rounded-2xl border bg-card p-3 shadow-sm">
                    <label className="grid w-8 shrink-0 place-items-center" aria-label={`Select ${po.number}`}>
                      <Checkbox checked={selected.includes(po.id)} disabled={complete} onCheckedChange={() => toggleSelected(po.id)} />
                    </label>
                    <Link href={`/qc/po/${po.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <ClipboardList size={16} className="shrink-0 text-primary" />
                          <span className="truncate font-semibold">{po.number}</span>
                        </div>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">{po.supplier}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{s.total} UPCs · {s.units.toLocaleString()} units · due {po.expectedDate}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <PoStatusBadge status={status} />
                          {s.openExceptions ? <span className="text-xs font-medium text-destructive">{s.openExceptions} open {s.openExceptions === 1 ? "exception" : "exceptions"}</span> : null}
                        </div>
                        {status === "IN_PROGRESS" ? <Progress value={s.percent} className="mt-2 h-1.5" /> : null}
                      </div>
                      <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
                    </Link>
                  </div>
                </StaggerListItem>
              );
            })}
          </StaggerList>
        </>
      )}
    </AppShell>
  );
}
