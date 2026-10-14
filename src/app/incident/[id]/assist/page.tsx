"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { use, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ItemCount } from "@/components/item-count";
import { REASONS } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useIncident } from "@/lib/queries";
import type { EscalationReason, ItemAge } from "@/lib/types";
import { useSession } from "@/store/session";

const AGES: { key: ItemAge; label: string; hint: string }[] = [
  { key: "NEW_FREIGHT", label: "New freight", hint: "Just arrived at the store" },
  { key: "OLD_MERCHANDISE", label: "Old merchandise", hint: "Has been in the store a while" },
];
const REASON_KEYS = Object.keys(REASONS) as EscalationReason[];

export default function AssistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const token = useSession((s) => s.token);
  const { data: d } = useIncident(id);
  const requested = useSearchParams().get("reason") as EscalationReason | null;
  const [reason, setReason] = useState<EscalationReason | null>(null);
  const [age, setAge] = useState<ItemAge | null>(null);
  const [note, setNote] = useState("");
  const [count, setCount] = useState(1);

  const suggested = requested && REASON_KEYS.includes(requested) ? requested : d?.gating === "RED" ? ((d.gating_reason as EscalationReason | null) ?? "LOW_EVIDENCE") : "USER_UNSURE";
  const chosen = reason ?? suggested;

  const send = useMutation({
    mutationFn: () => api.escalateIncident(token!, id, { reason: chosen, note, item_age: age!, missing_price_tag_count: count }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["incident", id] });
      void qc.invalidateQueries({ queryKey: ["incidents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (send.isSuccess) {
    return (
      <AppShell title="Request sent" back="/inbox">
        <Card>
          <CardContent className="grid place-items-center gap-3 py-8 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-success/15 text-success"><CheckCircle2 size={34} /></span>
            <h2 className="text-xl font-bold">Exception created</h2>
            <p className="max-w-xs text-sm text-muted-foreground">{d?.number_display} was sent to a resolver. Their answer will appear in your Inbox.</p>
            <Button render={<Link href="/inbox" />} nativeButton={false} size="lg" className="mt-2 w-full">Go to Inbox</Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const needsNote = chosen === "OTHER";
  const ready = age !== null && (!needsNote || note.trim().length > 0);

  return (
    <AppShell
      title="Request assistance"
      subtitle={d?.number_display}
      back={`/incident/${id}`}
      footer={
        <Button size="lg" className="w-full" disabled={!ready || send.isPending} onClick={() => send.mutate()}>
          {send.isPending ? <Loader2 className="animate-spin" /> : null} Send to resolver
        </Button>
      }
    >
      <div className="space-y-6">
        <section>
          <h2 className="mb-2 text-sm font-semibold">What&apos;s the problem?</h2>
          <div className="space-y-2">
            {REASON_KEYS.map((r) => (
              <button key={r} onClick={() => setReason(r)} aria-pressed={chosen === r} className={`flex w-full items-start gap-3 rounded-2xl border-2 p-3 text-left transition ${chosen === r ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                <span className={`mt-1 size-4 shrink-0 rounded-full border-2 ${chosen === r ? "border-primary bg-primary" : "border-muted-foreground/40"}`} />
                <span>
                  <span className="block font-semibold">{REASONS[r].label}</span>
                  <span className="text-sm text-muted-foreground">{REASONS[r].description}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <ItemCount value={count} onChange={setCount} />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Item age</h2>
          <div className="grid grid-cols-2 gap-2">
            {AGES.map((a) => (
              <button key={a.key} onClick={() => setAge(a.key)} aria-pressed={age === a.key} className={`rounded-2xl border-2 p-3 text-left transition ${age === a.key ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                <span className="block font-semibold">{a.label}</span>
                <span className="text-xs text-muted-foreground">{a.hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <Label htmlFor="note">Note {needsNote ? "(required)" : "(optional)"}</Label>
          <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Anything that helps the resolver find this item" />
        </section>
      </div>
    </AppShell>
  );
}
