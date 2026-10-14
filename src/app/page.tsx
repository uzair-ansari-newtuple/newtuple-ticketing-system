"use client";

import { Camera, ScanBarcode } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { Reveal, StaggerList, StaggerListItem } from "@/components/motion";
import { ListSkeleton } from "@/components/skeletons";
import { TicketRow } from "@/components/ticket-row";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/query-error";
import { useIncidents } from "@/lib/queries";
import type { IncidentSummary } from "@/lib/types";
import { useCapture } from "@/store/capture";
import { useLibrary } from "@/store/library";
import { useSession } from "@/store/session";

const NEEDS_ACTION = new Set(["CANDIDATES_READY", "CONFIRMED", "RESOLVER_RESPONSE_RECEIVED", "PRINTED", "FAILED"]);
const ATTENTION_LIMIT = 3;
const RECENT_LIMIT = 4;

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function TicketList({ items }: { items: IncidentSummary[] }) {
  return (
    <StaggerList className="space-y-2.5">
      {items.map((t) => (
        <StaggerListItem key={t.id}><TicketRow t={t} /></StaggerListItem>
      ))}
    </StaggerList>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useIncidents();
  const resetCapture = useCapture((s) => s.reset);
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);
  const refreshLibrary = useLibrary((s) => s.refresh);

  useEffect(() => {
    if (user?.role === "resolver") router.replace("/resolver");
  }, [user, router]);

  useEffect(() => {
    if (token) refreshLibrary().catch(() => undefined);
  }, [token, refreshLibrary]);

  const items = data?.items ?? [];
  const attention = items.filter((t) => NEEDS_ACTION.has(t.state) && !(t.state === "RESOLVER_RESPONSE_RECEIVED" && t.resolver_decision === null)).slice(0, ATTENTION_LIMIT);
  const shown = new Set(attention.map((t) => t.id));
  const recent = items.filter((t) => !shown.has(t.id)).slice(0, RECENT_LIMIT);

  return (
    <AppShell title={`Hello, ${user?.username ?? "there"}`} subtitle={user?.store_name}>
      <Reveal className="grid grid-cols-2 gap-3">
        <motion.div whileTap={{ scale: 0.97 }}>
          <Link href="/capture" onClick={resetCapture} className="flex h-full flex-col justify-between gap-6 rounded-2xl bg-primary p-4 text-primary-foreground shadow-lg shadow-primary/20">
            <Camera size={26} />
            <span><span className="block text-base font-bold">Photo match</span><span className="text-xs opacity-80">Photograph the item</span></span>
          </Link>
        </motion.div>
        <motion.div whileTap={{ scale: 0.97 }}>
          <Link href="/quick-scan" className="flex h-full flex-col justify-between gap-6 rounded-2xl border bg-card p-4 shadow-sm">
            <ScanBarcode size={26} className="text-primary" />
            <span><span className="block text-base font-bold">Quick scan</span><span className="text-xs text-muted-foreground">Scan a barcode</span></span>
          </Link>
        </motion.div>
      </Reveal>

      {isLoading ? (
        <Section title="Tickets"><ListSkeleton rows={3} /></Section>
      ) : isError ? (
        <Section title="Tickets"><QueryError error={error} onRetry={() => void refetch()} /></Section>
      ) : items.length === 0 ? (
        <p className="mt-12 text-center text-sm text-muted-foreground">No tickets yet. Start with a photo or a quick scan.</p>
      ) : (
        <>
          {attention.length ? <Section title="Needs your attention"><TicketList items={attention} /></Section> : null}
          {recent.length ? (
            <Section title="Recent" action={<Button render={<Link href="/inbox" />} nativeButton={false} variant="link" size="sm" className="h-auto p-0">View all</Button>}>
              <TicketList items={recent} />
            </Section>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
