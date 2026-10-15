"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { StaggerList, StaggerListItem } from "@/components/motion";
import { PillTabs } from "@/components/pill-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { EXCEPTION_REASONS } from "@/lib/qc/types";
import { useQc } from "@/store/qc";

type Tab = "open" | "resolved";

export default function ExceptionsPage() {
  const { pos, progress, resolveException } = useQc();
  const [tab, setTab] = useState<Tab>("open");
  const [resolving, setResolving] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const all = useMemo(
    () =>
      pos.flatMap((po) =>
        po.lines.flatMap((line) => {
          const result = progress[po.id]?.results[line.upc];
          return result?.exception ? [{ key: `${po.id}:${line.upc}`, po, line, result, exception: result.exception }] : [];
        }),
      ),
    [pos, progress],
  );
  const open = all.filter((e) => !e.exception.resolution);
  const resolved = all.filter((e) => e.exception.resolution);
  const shown = tab === "open" ? open : resolved;

  function resolve(poId: string, upc: string) {
    resolveException(poId, upc, note.trim());
    setResolving(null);
    setNote("");
    toast.success("Exception resolved");
  }

  return (
    <AppShell title="Exceptions" subtitle="Counts or goods that did not match the PO" area="qc">
      <PillTabs
        id="qc-exceptions"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "open", label: "Open", count: open.length, highlight: true },
          { key: "resolved", label: "Resolved", count: resolved.length },
        ]}
      />
      {shown.length === 0 ? (
        <p className="mt-12 text-center text-sm text-muted-foreground">{tab === "open" ? "No open exceptions." : "Nothing resolved yet."}</p>
      ) : (
        <StaggerList className="mt-4 space-y-2.5">
          {shown.map(({ key, po, line, result, exception }) => (
            <StaggerListItem key={key} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{line.name}</p>
                  <p className="text-xs text-muted-foreground"><Link href={`/qc/po/${po.id}`} className="text-primary underline-offset-2 hover:underline">{po.number}</Link> · <span className="font-mono">{line.upc}</span></p>
                </div>
                <Badge variant={exception.resolution ? "success" : "destructive"}>{EXCEPTION_REASONS[exception.reason]}</Badge>
              </div>
              <p className="mt-2 text-sm">Received <strong>{result.receivedQty}</strong> of {line.expectedQty} · {formatDateTime(exception.raisedAt)}</p>
              {exception.note ? <p className="mt-1 text-sm text-muted-foreground">{exception.note}</p> : null}
              {exception.resolution ? (
                <p className="mt-2 rounded-lg bg-success/12 p-2 text-sm text-success">Resolved {formatDateTime(exception.resolution.resolvedAt)}{exception.resolution.note ? `: ${exception.resolution.note}` : ""}</p>
              ) : resolving === key ? (
                <div className="mt-3 space-y-2">
                  <Textarea rows={2} placeholder="What was done? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => setResolving(null)}>Cancel</Button>
                    <Button onClick={() => resolve(po.id, line.upc)}><Check /> Mark resolved</Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => { setResolving(key); setNote(""); }}>Resolve</Button>
              )}
            </StaggerListItem>
          ))}
        </StaggerList>
      )}
    </AppShell>
  );
}
