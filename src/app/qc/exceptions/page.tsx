"use client";

import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { StaggerList, StaggerListItem } from "@/components/motion";
import { PillTabs } from "@/components/pill-tabs";
import { QueryError } from "@/components/query-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useQcExceptions, useQcMutations } from "@/lib/qc/queries";
import { EXCEPTION_REASONS } from "@/lib/qc/types";

type Tab = "open" | "resolved";

export default function ExceptionsPage() {
  const { data, isLoading, isError, error, refetch } = useQcExceptions();
  const { resolve } = useQcMutations();
  const [tab, setTab] = useState<Tab>("open");
  const [resolving, setResolving] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const all = data?.items ?? [];
  const open = all.filter((l) => l.state === "EXCEPTION");
  const resolved = all.filter((l) => l.state === "EXCEPTION_RESOLVED");
  const shown = tab === "open" ? open : resolved;

  function submit(id: string) {
    resolve.mutate(
      { id, note: note.trim() },
      { onSuccess: () => { setResolving(null); setNote(""); toast.success("Exception resolved"); }, onError: (e) => toast.error(e.message) },
    );
  }

  return (
    <AppShell title="Exceptions" subtitle="Counts or goods that did not match the PO" area="qc">
      <PillTabs id="qc-exceptions" value={tab} onChange={setTab} tabs={[{ key: "open", label: "Open", count: open.length, highlight: true }, { key: "resolved", label: "Resolved", count: resolved.length }]} />
      {isLoading ? (
        <Skeleton className="mt-4 h-32 w-full rounded-2xl" />
      ) : isError ? (
        <QueryError error={error} onRetry={refetch} />
      ) : shown.length === 0 ? (
        <p className="mt-12 text-center text-sm text-muted-foreground">{tab === "open" ? "No open exceptions." : "Nothing resolved yet."}</p>
      ) : (
        <StaggerList className="mt-4 space-y-2.5">
          {shown.map((l) => (
            <StaggerListItem key={l.id} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{l.name}</p>
                  <p className="text-xs text-muted-foreground"><Link href={`/qc/po/${l.po_id}`} className="text-primary underline-offset-2 hover:underline">{l.po_number}</Link> · <span className="font-mono">{l.upc}</span></p>
                </div>
                {l.exception ? <Badge variant={l.exception.resolution ? "success" : "destructive"}>{EXCEPTION_REASONS[l.exception.reason]}</Badge> : null}
              </div>
              <p className="mt-2 text-sm">Received <strong>{l.received_qty ?? 0}</strong> of {l.expected_qty}</p>
              {l.exception?.note ? <p className="mt-1 text-sm text-muted-foreground">{l.exception.note}</p> : null}
              {l.exception?.resolution ? (
                <p className="mt-2 rounded-lg bg-success/12 p-2 text-sm text-success">Resolved: {l.exception.resolution.note}</p>
              ) : resolving === l.id ? (
                <div className="mt-3 space-y-2">
                  <Textarea rows={2} placeholder="What was done?" value={note} onChange={(e) => setNote(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => setResolving(null)}>Cancel</Button>
                    <Button disabled={!note.trim() || resolve.isPending} onClick={() => submit(l.id)}>{resolve.isPending ? <Loader2 className="animate-spin" /> : <Check />} Mark resolved</Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => { setResolving(l.id); setNote(""); }}>Resolve</Button>
              )}
            </StaggerListItem>
          ))}
        </StaggerList>
      )}
    </AppShell>
  );
}
