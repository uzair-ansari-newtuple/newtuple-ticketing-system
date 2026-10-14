"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Search } from "lucide-react";
import { use, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { TicketSkeleton } from "@/components/skeletons";
import { StateBadge, REASONS } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useIncident, useIncidentImages } from "@/lib/queries";
import { SLOTS } from "@/lib/slots";
import type { NormalizedMetadata, ResolverDecision } from "@/lib/types";
import { useSession } from "@/store/session";
import { useQuery } from "@tanstack/react-query";

const DECISIONS: { key: ResolverDecision; label: string; hint: string }[] = [
  { key: "RECOMMEND", label: "Recommend an item", hint: "Pick the right product" },
  { key: "CANT_RESOLVE", label: "Can't identify", hint: "Not enough to go on" },
  { key: "NOT_APPAREL", label: "Not an apparel item", hint: "Outside this catalog" },
];

export default function ResolverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const token = useSession((s) => s.token);
  const { data: d } = useIncident(id);
  const { data: imageData } = useIncidentImages(id);
  const [decision, setDecision] = useState<ResolverDecision>("RECOMMEND");
  const [query, setQuery] = useState("");
  const [sku, setSku] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const products = useQuery({ queryKey: ["products", query], queryFn: () => api.searchProducts(token!, query), enabled: Boolean(token) && decision === "RECOMMEND" });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["incident", id] }), qc.invalidateQueries({ queryKey: ["resolver-queue"] })]);
  const claim = useMutation({ mutationFn: () => api.resolverClaim(token!, id), onSuccess: () => { toast.success("Ticket claimed"); return refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const respond = useMutation({
    mutationFn: () => api.resolverRespond(token!, id, { decision, sku: sku ?? undefined, comment }),
    onSuccess: () => { toast.success("Response sent to the store"); return refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!d) return <AppShell role="resolver" title="Ticket" back="/resolver"><TicketSkeleton /></AppShell>;

  const m = d.extraction?.normalized_metadata;
  const e = d.escalation;
  const r = d.resolver;
  const photos = imageData?.images ?? [];
  const detected: [string, string | null | undefined][] = m ? [["Brand", m.Brand], ["Category", m.ClassName], ["Color", m.ColorName], ["Size", m.SizeCode], ["Barcode", m.Barcode]] : [];

  return (
    <AppShell role="resolver" title={d.number_display} subtitle={`${d.store_id} · ${formatDateTime(d.created_at)}`} back="/resolver">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2"><StateBadge s={d} /></div>

        {e ? (
          <Card>
            <CardContent className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Store request</p>
              <p className="font-semibold">{REASONS[e.reason].label}</p>
              {e.note ? <p className="text-sm">“{e.note}”</p> : null}
              <Badge variant="outline">{e.item_age === "NEW_FREIGHT" ? "New freight" : "Old merchandise"}</Badge>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Photos</p>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p) => (
                <div key={p.capture.sha256}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.data_url} alt={`${p.slot} photo`} className="aspect-square w-full rounded-xl object-cover" />
                  <p className="mt-1 text-center text-xs text-muted-foreground">{SLOTS.find((s) => s.key === p.slot)?.label}</p>
                </div>
              ))}
            </div>
            {detected.length ? (
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                {detected.map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-muted/70 p-2.5">
                    <dt className="text-[11px] uppercase text-muted-foreground">{k}</dt>
                    <dd className="font-semibold">{v ?? "Not found"}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </CardContent>
        </Card>

        {d.state === "ESCALATED" ? (
          <Button size="lg" className="w-full" disabled={claim.isPending} onClick={() => claim.mutate()}>
            {claim.isPending ? <Loader2 className="animate-spin" /> : null} Claim this ticket
          </Button>
        ) : null}

        {d.state === "RESOLUTION_IN_PROGRESS" ? (
          <Card>
            <CardContent className="space-y-4">
              <h2 className="font-bold">Your response</h2>
              <div className="grid gap-2">
                {DECISIONS.map((x) => (
                  <button key={x.key} onClick={() => setDecision(x.key)} aria-pressed={decision === x.key} className={`rounded-2xl border-2 p-3 text-left transition ${decision === x.key ? "border-primary bg-primary/5" : "border-border"}`}>
                    <span className="block font-semibold">{x.label}</span>
                    <span className="text-xs text-muted-foreground">{x.hint}</span>
                  </button>
                ))}
              </div>

              {decision === "RECOMMEND" ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-3.5 text-muted-foreground" />
                    <Input value={query} onChange={(ev) => setQuery(ev.target.value)} placeholder="Search name, brand, SKU or UPC" className="h-11 pl-9" />
                  </div>
                  <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                    {(products.data?.items ?? []).map((p: NormalizedMetadata) => (
                      <li key={p.Sku}>
                        <button onClick={() => setSku(p.Sku)} aria-pressed={sku === p.Sku} className={`flex w-full items-center justify-between rounded-xl border-2 px-3 py-2 text-left text-sm transition ${sku === p.Sku ? "border-primary bg-primary/5" : "border-border"}`}>
                          <span><span className="block font-semibold">{p.ProductName}</span><span className="text-xs text-muted-foreground">{p.Brand} · {p.ColorName} · {p.Sku}</span></span>
                          <span className="font-bold">{p.Price}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="comment">Comment {decision === "RECOMMEND" ? "(optional)" : "(required)"}</Label>
                <Textarea id="comment" value={comment} onChange={(ev) => setComment(ev.target.value)} maxLength={500} />
              </div>
              <Button size="lg" className="w-full" disabled={respond.isPending || (decision === "RECOMMEND" ? !sku : !comment.trim())} onClick={() => respond.mutate()}>
                {respond.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Send to store
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {r?.status === "RESOLVED" ? (
          <Card>
            <CardContent className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sent to the store</p>
              <p className="font-semibold">{r.decision === "RECOMMEND" ? r.recommended?.ProductName : r.decision === "NOT_APPAREL" ? "Not an apparel item" : "Couldn't identify"}</p>
              {r.comment ? <p className="text-sm">“{r.comment}”</p> : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
