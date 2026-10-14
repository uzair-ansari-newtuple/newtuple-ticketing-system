"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Minus, Plus, Printer, ShieldAlert, Tag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Barcode } from "@/components/barcode";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { IncidentDetail } from "@/lib/types";
import { useSession } from "@/store/session";

const MAX_COPIES = 99;
const PRINTERS = [1, 2];

/** The CitiTrends "Action needed" card: print a replacement tag, put it on the item, then confirm it was added. */
export function PrintPanel({ d }: { d: IncidentDetail }) {
  const qc = useQueryClient();
  const token = useSession((s) => s.token)!;
  const [printer, setPrinter] = useState(1);
  const [copies, setCopies] = useState(d.missing_price_tag_count);
  const [markdown, setMarkdown] = useState(false);
  const m = d.selected?.metadata;

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["incident", d.id] }), qc.invalidateQueries({ queryKey: ["incidents"] })]);
  const print = useMutation({ mutationFn: () => api.printLabel(token, { incident_id: d.id, printer, copies }), onSettled: refresh });
  const confirmTag = useMutation({
    mutationFn: () => api.confirmNewTag(token, d.id),
    onSuccess: () => {
      toast.success("Ticket completed");
      return refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!m) return null;
  const printed = d.state === "PRINTED" || print.isSuccess;

  return (
    <div className="space-y-4">
      <div>
        <p className="font-bold">Action needed</p>
        <p className="text-sm text-muted-foreground">Print a replacement price tag, add it to the item, then confirm below.</p>
      </div>

      <div className="rounded-2xl border-2 border-dashed border-border bg-white p-5 text-slate-900">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{m.Brand}</p>
        <p className="text-lg font-bold leading-tight">{m.ProductName ?? m.ClassName}</p>
        <div className="mt-1 flex items-end justify-between">
          <p className="text-sm text-slate-600">{[m.ColorName, m.SizeCode ? `Size ${m.SizeCode}` : null].filter(Boolean).join(" · ")}</p>
          <p className="text-4xl font-extrabold tracking-tight">{m.Price ?? ""}</p>
        </div>
        <div className="mt-3 flex justify-center"><Barcode value={m.Barcode ?? ""} className="h-24 w-full max-w-xs text-black" /></div>
        <p className="mt-1 text-center font-mono text-[11px] text-slate-500">{m.Sku}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[false, true].map((md) => (
          <button key={String(md)} onClick={() => setMarkdown(md)} aria-pressed={markdown === md} className={`rounded-xl border-2 py-2 text-sm font-semibold transition ${markdown === md ? "border-primary bg-primary/5" : "border-border"}`}>
            {md ? "Markdown" : "Regular price"}
          </button>
        ))}
      </div>
      <Alert className="border-warning/30 bg-warning/10">
        <AlertTriangle className="text-warning" />
        <AlertTitle>Check tag colour</AlertTitle>
        <AlertDescription>{markdown ? "Use a yellow and white tag for markdown." : "Use a white tag for regular-priced items. Yellow and white is for markdown."}</AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Printer</span>
          {PRINTERS.map((p) => (
            <button key={p} onClick={() => setPrinter(p)} aria-pressed={printer === p} className={`size-9 rounded-full border-2 text-sm font-bold transition ${printer === p ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{p}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Fewer copies" disabled={copies <= 1} onClick={() => setCopies((c) => c - 1)}><Minus /></Button>
          <span className="w-6 text-center text-lg font-bold">{copies}</span>
          <Button variant="outline" size="icon" aria-label="More copies" disabled={copies >= MAX_COPIES} onClick={() => setCopies((c) => c + 1)}><Plus /></Button>
        </div>
      </div>

      {print.isError ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Printing failed</AlertTitle>
          <AlertDescription>
            {print.error.message}
            <Link href={`/incident/${d.id}/assist?reason=PRINT_FAILURE`} className="mt-2 flex items-center gap-1.5 font-semibold underline"><ShieldAlert size={14} /> Request assistance</Link>
          </AlertDescription>
        </Alert>
      ) : null}
      {print.isSuccess ? <p className="flex items-center gap-2 text-sm font-medium text-success"><CheckCircle2 size={16} /> {copies} tag{copies === 1 ? "" : "s"} sent to printer {printer}.</p> : null}

      <Button size="lg" className="w-full" disabled={print.isPending} onClick={() => print.mutate()}>
        {print.isPending ? <Loader2 className="animate-spin" /> : <Printer />} Print {copies} Tag{copies === 1 ? "" : "s"}
      </Button>
      <Button size="lg" variant="outline" className="w-full" disabled={!printed || confirmTag.isPending} onClick={() => confirmTag.mutate()}>
        {confirmTag.isPending ? <Loader2 className="animate-spin" /> : <Tag />} Confirm New Tag Added
      </Button>
      {!printed ? <p className="text-center text-xs text-muted-foreground">Print the tag above first</p> : null}
    </div>
  );
}
