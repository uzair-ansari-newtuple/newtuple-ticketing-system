"use client";

import { ClipboardCheck, ScanSearch } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { useSession } from "@/store/session";

const APPS = [
  { href: "/qc", icon: ClipboardCheck, title: "DC QC", text: "Check a shipment against its purchase order, UPC by UPC", tone: "bg-primary text-primary-foreground shadow-primary/20" },
  { href: "/", icon: ScanSearch, title: "Ticketing", text: "Photograph an item with a missing tag and print a new one", tone: "bg-card text-foreground ring-1 ring-border shadow-black/5" },
];

export default function AppsPage() {
  const user = useSession((s) => s.user);
  return (
    <AppShell title={`Hello, ${user?.name ?? "there"}`} subtitle="Choose what you want to work on" area="hub">
      <Stagger className="space-y-3">
        {APPS.map(({ href, icon: Icon, title, text, tone }) => (
          <StaggerItem key={href}>
            <Reveal>
              <Link href={href} className={`flex items-center gap-4 rounded-2xl p-5 shadow-lg ${tone}`}>
                <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${tone.includes("bg-primary") ? "bg-white/15" : "bg-primary/10 text-primary"}`}><Icon size={26} /></span>
                <span>
                  <span className="block text-lg font-bold">{title}</span>
                  <span className="text-sm opacity-80">{text}</span>
                </span>
              </Link>
            </Reveal>
          </StaggerItem>
        ))}
      </Stagger>
    </AppShell>
  );
}
