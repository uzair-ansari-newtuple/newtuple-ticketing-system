"use client";

import { ChevronRight, ClipboardList, Loader2, PackageSearch, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Reveal, StaggerList, StaggerListItem } from "@/components/motion";
import { PoStatusBadge } from "@/components/qc-badges";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { percentDone } from "@/lib/qc/progress";
import { useQcMutations, useQcPos } from "@/lib/qc/queries";
import { useQcSelection } from "@/store/qc";

export default function QcHomePage() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useQcPos();
  const { fetchPos, start } = useQcMutations();
  const { selected, toggle, clear } = useQcSelection();
  const pos = data?.items ?? [];

  async function fetchFromSource() {
    try {
      const res = await fetchPos.mutateAsync();
      toast.success(res.created.length ? `${res.created.length} purchase orders fetched` : "Already up to date");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not fetch purchase orders");
    }
  }

  async function begin() {
    const ids = [...selected];
    try {
      await start.mutateAsync(ids);
      clear();
      router.push(`/qc/po/${ids[0]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start QC");
    }
  }

  const footer = selected.length ? (
    <Button size="lg" className="h-12 w-full text-base" onClick={begin} disabled={start.isPending}>
      {start.isPending ? <Loader2 className="animate-spin" /> : null} Start QC · {selected.length} {selected.length === 1 ? "PO" : "POs"}
    </Button>
  ) : undefined;

  return (
    <AppShell title="Purchase orders" subtitle="Choose the POs to check" area="qc" footer={footer}>
      {isLoading ? (
        <div className="space-y-2.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}</div>
      ) : isError ? (
        <QueryError error={error} onRetry={refetch} />
      ) : pos.length === 0 ? (
        <Reveal className="mt-10 flex flex-col items-center gap-4 text-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary"><PackageSearch size={30} /></span>
          <div>
            <p className="font-semibold">No purchase orders yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Fetch the POs that arrived at the DC to begin.</p>
          </div>
          <Button size="lg" onClick={fetchFromSource} disabled={fetchPos.isPending}>
            {fetchPos.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Fetch POs
          </Button>
        </Reveal>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{pos.length} purchase orders</p>
            <Button variant="outline" size="sm" onClick={fetchFromSource} disabled={fetchPos.isPending}>
              {fetchPos.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Fetch POs
            </Button>
          </div>
          <StaggerList className="space-y-2.5">
            {pos.map((po) => {
              const t = po.totals;
              const finished = po.state === "QC_COMPLETE";
              return (
                <StaggerListItem key={po.id}>
                  <div className="flex items-stretch gap-3 rounded-2xl border bg-card p-3 shadow-sm">
                    <label className="grid w-8 shrink-0 place-items-center" aria-label={`Select ${po.number}`}>
                      <Checkbox checked={selected.includes(po.id)} disabled={finished || po.state === "EXCEPTIONS_OPEN"} onCheckedChange={() => toggle(po.id)} />
                    </label>
                    <Link href={`/qc/po/${po.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <ClipboardList size={16} className="shrink-0 text-primary" />
                          <span className="truncate font-semibold">{po.number}</span>
                        </div>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">{po.supplier}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{t.lines} UPCs · {t.units.toLocaleString()} units · due {po.expected_date}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <PoStatusBadge state={po.state} />
                          {t.open_exceptions ? <span className="text-xs font-medium text-destructive">{t.open_exceptions} open {t.open_exceptions === 1 ? "exception" : "exceptions"}</span> : null}
                        </div>
                        {po.state === "QC_IN_PROGRESS" ? <Progress value={percentDone(t)} className="mt-2 h-1.5" /> : null}
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
