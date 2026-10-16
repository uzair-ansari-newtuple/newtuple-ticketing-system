"use client";

import { ChevronRight, Loader2, PackageSearch, RefreshCw, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Reveal, StaggerList, StaggerListItem } from "@/components/motion";
import { ShipmentBadge } from "@/components/qc-badges";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { percentDone } from "@/lib/qc/progress";
import { useQcMutations, useShipments } from "@/lib/qc/queries";
import { useSession } from "@/store/session";
import { useQcSelection } from "@/store/qc";

export default function QcHomePage() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useShipments();
  const { fetch: fetchMutation, start } = useQcMutations();
  const { selected, toggle, clear } = useQcSelection();
  const token = useSession((s) => s.token);
  const shipments = data?.items ?? [];
  const autoFetched = useRef(false);

  async function fetchFromSource(quiet = false) {
    try {
      const res = await fetchMutation.mutateAsync();
      if (!quiet || res.created.length) toast.success(res.created.length ? `${res.created.length} shipments fetched` : "Already up to date");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not fetch shipments");
    }
  }

  // Fetch the POs that arrived at the DC as soon as the screen opens. Fetching only adds new ones, so it is safe each time.
  useEffect(() => {
    if (!token || autoFetched.current) return;
    autoFetched.current = true;
    void fetchFromSource(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
    <AppShell title="Shipments" subtitle="Tick the shipments you want to check, then tap Start QC" area="qc" footer={footer}>
      {isLoading || (shipments.length === 0 && fetchMutation.isPending) ? (
        <div className="space-y-2.5" aria-busy="true">
          {fetchMutation.isPending ? <p className="flex items-center gap-2 pb-1 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Fetching shipments from the DC…</p> : null}{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}</div>
      ) : isError ? (
        <QueryError error={error} onRetry={refetch} />
      ) : shipments.length === 0 ? (
        <Reveal className="mt-10 flex flex-col items-center gap-4 text-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary"><PackageSearch size={30} /></span>
          <div>
            <p className="font-semibold">No shipments yet</p>
            <p className="mt-1 text-sm text-muted-foreground">No shipments have arrived at the DC yet. Tap Fetch POs to look again.</p>
          </div>
          <Button size="lg" onClick={() => fetchFromSource()} disabled={fetchMutation.isPending}>
            {fetchMutation.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Fetch POs
          </Button>
        </Reveal>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{shipments.length} shipments</p>
            <Button variant="outline" size="sm" onClick={() => fetchFromSource()} disabled={fetchMutation.isPending}>
              {fetchMutation.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Fetch POs
            </Button>
          </div>
          <StaggerList className="space-y-2.5">
            {shipments.map((s) => (
              <StaggerListItem key={s.id}>
                <div className="flex items-stretch gap-3 rounded-2xl border bg-card p-3 shadow-sm">
                  <label className="grid w-8 shrink-0 place-items-center" aria-label={`Select ${s.po_number}`}>
                    <Checkbox checked={selected.includes(s.id)} disabled={s.state !== "CREATED"} onCheckedChange={() => toggle(s.id)} />
                  </label>
                  <Link href={`/qc/po/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Truck size={16} className="shrink-0 text-primary" />
                        <span className="truncate font-semibold">{s.po_number}</span>
                        <span className="text-xs text-muted-foreground">{s.shipment_number}</span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">{s.vendor_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{s.totals.upcs} UPCs · {s.totals.units.toLocaleString()} units · {s.dc_id}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <ShipmentBadge state={s.state} />
                        {s.totals.on_hold ? <span className="text-xs font-medium text-destructive">{s.totals.on_hold} on hold</span> : null}
                      </div>
                      {s.state === "IN_PROGRESS" ? <Progress value={percentDone(s.totals)} className="mt-2 h-1.5" /> : null}
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
                  </Link>
                </div>
              </StaggerListItem>
            ))}
          </StaggerList>
        </>
      )}
    </AppShell>
  );
}
