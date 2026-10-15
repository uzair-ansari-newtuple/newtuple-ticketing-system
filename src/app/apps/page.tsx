"use client";

import { ArrowRight, ClipboardCheck, ScanSearch } from "lucide-react";
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
      {value === undefined ? <Skeleton className="h-7 w-10" /> : <p className={`text-2xl font-bold leading-none ${tone === "alert" && value > 0 ? "text-destructive" : ""}`}>{value}</p>}
      <p className="mt-1 text-xs opacity-75">{label}</p>
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
        <StaggerItem>
          <Reveal>
            <Link href="/qc" className="group relative flex h-full flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-hero-from to-hero-to p-6 text-white shadow-xl shadow-primary/25 outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/50">
              <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/10" />
              <span className="relative grid size-12 place-items-center rounded-2xl bg-white/15"><ClipboardCheck size={26} /></span>
              <h2 className="relative mt-5 text-2xl font-bold tracking-tight">DC QC</h2>
              <p className="relative mt-1 text-sm text-white/80">Check each shipment against its purchase order, UPC by UPC.</p>
              <ul className="relative mt-4 space-y-1.5 text-sm text-white/85">
                <li>• Count pallets with a live variance</li>
                <li>• Photograph the goods as evidence</li>
                <li>• Flag exceptions for the supervisor</li>
              </ul>
              <div className="relative mt-6 grid grid-cols-2 gap-4 border-t border-white/20 pt-4">
                <Stat value={qc.shipments} label="Shipments to check" />
                <Stat value={qc.onHold} label="UPCs on hold" />
              </div>
              <span className="relative mt-5 inline-flex items-center gap-2 text-sm font-semibold">Open DC QC <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></span>
            </Link>
          </Reveal>
        </StaggerItem>

        <StaggerItem>
          <Reveal delay={0.08}>
            <Link href="/" className="group relative flex h-full flex-col overflow-hidden rounded-3xl border bg-card p-6 shadow-lg shadow-black/5 outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/50">
              <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-primary/8" />
              <span className="relative grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><ScanSearch size={26} /></span>
              <h2 className="relative mt-5 text-2xl font-bold tracking-tight">Ticketing</h2>
              <p className="relative mt-1 text-sm text-muted-foreground">Fix an item that is missing its price tag.</p>
              <ul className="relative mt-4 space-y-1.5 text-sm text-muted-foreground">
                <li>• Photograph the item, the app finds it</li>
                <li>• Send hard cases to a resolver</li>
                <li>• Print the new tag in seconds</li>
              </ul>
              <div className="relative mt-6 grid grid-cols-2 gap-4 border-t pt-4">
                <Stat value={tickets.open} label="Open tickets" />
                <Stat value={tickets.updates} label="New updates" tone="alert" />
              </div>
              <span className="relative mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">Open Ticketing <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></span>
            </Link>
          </Reveal>
        </StaggerItem>
      </Stagger>
    </AppShell>
  );
}
