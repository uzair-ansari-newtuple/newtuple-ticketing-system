"use client";

import { ArrowRight, ClipboardCheck, RotateCcw, ScanSearch } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { Skeleton } from "@/components/ui/skeleton";
import { useQcSummary, useTicketSummary } from "@/lib/hub";
import { useSession } from "@/store/session";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Stat({ value, label, tone }: { value: number | undefined; label: string; tone?: "alert" }) {
  return (
    <div className="min-w-0">
      {value === undefined ? <Skeleton className="h-7 w-10" /> : <p className={`text-3xl font-light leading-none tabular-nums ${tone === "alert" && value > 0 ? "text-destructive" : ""}`}>{value}</p>}
      <p className="mt-1.5 text-xs font-medium uppercase tracking-wider opacity-75">{label}</p>
    </div>
  );
}

export default function AppsPage() {
  const user = useSession((s) => s.user);
  const qc = useQcSummary();
  const tickets = useTicketSummary();
  const first = (user?.name ?? "").split(" ")[0];

  return (
    <AppShell title={`${greeting()}${first ? `, ${first}` : ""}`} subtitle={user?.store_name ? `${user.store_name} · choose what you want to work on` : "Choose what you want to work on"} area="hub">
      <Stagger className="grid gap-4 md:grid-cols-2">
        <StaggerItem className="h-full">
          <Reveal className="h-full">
            <Link href="/qc" className="group flex h-full flex-col rounded-2xl bg-brand p-8 text-white shadow-md outline-none transition-all duration-300 hover:-translate-y-1 hover:shadow-lg focus-visible:ring-3 focus-visible:ring-ring/30">
              <span className="grid size-12 place-items-center rounded-xl border border-white/30"><ClipboardCheck size={24} strokeWidth={1.5} /></span>
              <h2 className="mt-6 text-2xl font-semibold tracking-tight">DC QC</h2>
              <p className="mt-1 text-sm font-light text-white/85">Check each shipment against its purchase order.</p>
              <ul className="mt-4 space-y-1.5 text-sm font-light text-white/85">
                <li>• Count pallets with a live variance</li>
                <li>• Photograph the goods as evidence</li>
                <li>• Flag exceptions for the supervisor</li>
              </ul>
              <div className="mt-auto pt-6">
                <div className="grid grid-cols-2 gap-4 border-t border-white/25 pt-5">
                  <Stat value={qc.shipments} label="Shipments to check" />
                  <Stat value={qc.onHold} label="UPCs on hold" />
                </div>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium">Open DC QC <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></span>
              </div>
            </Link>
          </Reveal>
        </StaggerItem>

        <StaggerItem className="h-full">
          <Reveal delay={0.08} className="h-full">
            <Link href="/" className="group flex h-full flex-col rounded-2xl border bg-card p-8 shadow-sm outline-none transition-all duration-300 hover:-translate-y-1 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/30">
              <span className="grid size-12 place-items-center rounded-xl border border-primary/30 text-primary"><ScanSearch size={24} strokeWidth={1.5} /></span>
              <h2 className="mt-6 text-2xl font-semibold tracking-tight">Ticketing</h2>
              <p className="mt-1 text-sm font-light text-muted-foreground">Fix an item that is missing its price tag.</p>
              <ul className="mt-4 space-y-1.5 text-sm font-light text-muted-foreground">
                <li>• Photograph the item, the app finds it</li>
                <li>• Send hard cases to a resolver</li>
                <li>• Print the new tag in seconds</li>
              </ul>
              <div className="mt-auto pt-6">
                <div className="grid grid-cols-2 gap-4 border-t pt-5">
                  <Stat value={tickets.open} label="Open tickets" />
                  <Stat value={tickets.updates} label="New updates" tone="alert" />
                </div>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary">Open Ticketing <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></span>
              </div>
            </Link>
          </Reveal>
        </StaggerItem>
        <StaggerItem className="md:col-span-2">
          <Reveal delay={0.16}>
            <Link href="/demo" className="group flex items-center gap-4 rounded-2xl border border-dashed bg-card/60 p-5 outline-none transition-colors hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/50">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-foreground"><RotateCcw size={22} strokeWidth={1.5} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold tracking-tight">Demo cockpit</span>
                <span className="block text-sm text-muted-foreground">Put DC QC and Ticketing back at the start before the next demo.</span>
              </span>
              <ArrowRight size={18} className="shrink-0 transition-transform group-hover:translate-x-1" />
            </Link>
          </Reveal>
        </StaggerItem>
      </Stagger>
    </AppShell>
  );
}
