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
import { FLAG_REASONS } from "@/lib/qc/dto";
import { formatDateTime } from "@/lib/format";
import { useFlagged, useNotifications, useQcMutations } from "@/lib/qc/queries";

type Tab = "open" | "resolved";
type Action = "approve" | "return" | "wont_qc";

const ANSWERS: { key: Action; label: string }[] = [
  { key: "approve", label: "Approve as counted" },
  { key: "return", label: "Send back to recount" },
  { key: "wont_qc", label: "Skip this UPC" },
];

export default function ExceptionsPage() {
  const { data, isLoading, isError, error, refetch } = useFlagged();
  const { resolve } = useQcMutations();
  const messages = useNotifications().data?.items ?? [];
  const [tab, setTab] = useState<Tab>("open");
  const [answering, setAnswering] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const all = data?.items ?? [];
  const open = all.filter((u) => u.state === "SUPERVISOR_HOLD");
  const resolved = all.filter((u) => u.state !== "SUPERVISOR_HOLD");
  const shown = tab === "open" ? open : resolved;

  function answer(id: string, action: Action) {
    resolve.mutate(
      { id, action, note: note.trim() },
      { onSuccess: () => { setAnswering(null); setNote(""); toast.success("Answer sent"); }, onError: (e) => toast.error(e.message) },
    );
  }

  return (
    <AppShell title="Exceptions" subtitle="UPCs that someone reported a problem with. A supervisor decides what happens next." area="qc">
      <PillTabs id="qc-exceptions" value={tab} onChange={setTab} tabs={[{ key: "open", label: "Waiting for supervisor", count: open.length, highlight: true }, { key: "resolved", label: "Answered", count: resolved.length }]} />
      {isLoading ? (
        <Skeleton className="mt-4 h-32 w-full rounded-2xl" />
      ) : isError ? (
        <QueryError error={error} onRetry={refetch} />
      ) : shown.length === 0 ? (
        <p className="mt-12 text-center text-sm text-muted-foreground">{tab === "open" ? "Nothing is waiting for a supervisor." : "No problems have been answered yet."}</p>
      ) : (
        <StaggerList className="mt-4 space-y-2.5">
          {shown.map((u) => (
            <StaggerListItem key={u.id} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{u.description}</p>
                  <p className="text-xs text-muted-foreground"><Link href={`/qc/po/${u.shipment_id}`} className="text-primary underline-offset-2 hover:underline">{u.po_number}</Link> · <span className="font-mono">{u.upc_code}</span></p>
                </div>
                {u.flag ? <Badge variant={u.state === "SUPERVISOR_HOLD" ? "destructive" : "success"}>{FLAG_REASONS[u.flag.reason]}</Badge> : null}
              </div>
              <p className="mt-2 text-sm">Counted <strong>{u.received_units}</strong> · PO says {u.expected_units}</p>
              {u.flag?.note ? <p className="mt-1 text-sm text-muted-foreground">{u.flag.note}</p> : null}
              {u.state !== "SUPERVISOR_HOLD" ? (
                <p className="mt-2 rounded-lg bg-success/12 p-2 text-sm text-success">
                  {u.state === "APPROVED" ? "Approved as counted" : u.state === "WONT_QC" ? "Skipped (left out of QC)" : "Sent back to the associate to recount"}
                  {u.flag?.resolution_note ? `: ${u.flag.resolution_note}` : ""}
                </p>
              ) : answering === u.id ? (
                <div className="mt-3 space-y-2">
                  <p className="rounded-xl bg-primary/8 p-3 text-xs leading-relaxed"><strong>Approve as counted:</strong> accept the units as they are. <strong>Send back to recount:</strong> the associate checks the UPC again. <strong>Skip this UPC:</strong> it is left out of QC (for example when a claim has been filed).</p>
                  <Textarea rows={2} placeholder="Add a note for the associate (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <div className="grid grid-cols-3 gap-2">
                    {ANSWERS.map((a) => (
                      <Button key={a.key} size="sm" variant={a.key === "approve" ? "default" : "outline"} disabled={resolve.isPending} onClick={() => answer(u.id, a.key)}>
                        {resolve.isPending ? <Loader2 className="animate-spin" /> : a.key === "approve" ? <Check /> : null} {a.label}
                      </Button>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => setAnswering(null)}>Cancel</Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => { setAnswering(u.id); setNote(""); }}>Answer</Button>
              )}
            </StaggerListItem>
          ))}
        </StaggerList>
      )}

      {messages.length ? (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold">Latest messages</h2>
          <ul className="space-y-1.5">
            {messages.slice(0, 6).map((m) => (
              <li key={m.id} className="flex flex-col gap-0.5 rounded-xl border bg-card px-3 py-2 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <span>{m.message}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(m.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
