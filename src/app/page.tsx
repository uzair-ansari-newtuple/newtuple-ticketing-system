"use client";

import { Camera, ChevronRight, Inbox as InboxIcon, Library, ScanBarcode, ScanSearch, Ticket } from "lucide-react";
import { useEffect } from "react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SafeImg } from "@/components/safe-img";
import { CountUp, EASE, Reveal, StaggerList, StaggerListItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ListSkeleton } from "@/components/skeletons";
import { StateBadge } from "@/components/status";
import { formatDateTime } from "@/lib/format";
import { useIncidents } from "@/lib/queries";
import { useCapture } from "@/store/capture";
import { useLibrary } from "@/store/library";
import { useSession } from "@/store/session";

export default function HomePage() {
  const router = useRouter();
  const { data: incidentData, isLoading: incidentsLoading } = useIncidents();
  const items = incidentData?.items ?? [];
  const unread = items.filter((i) => i.unread).length;
  const libraryCount = useLibrary((s) => s.items.length + s.catalogCount);
  const refreshLibrary = useLibrary((s) => s.refresh);
  const token = useSession((s) => s.token);

  useEffect(() => {
    if (token) refreshLibrary().catch(() => undefined);
  }, [token, refreshLibrary]);
  const resetCapture = useCapture((s) => s.reset);
  const user = useSession((s) => s.user);

  const printed = items.filter((i) => i.state === "PRINTED").length;
  const waiting = items.filter((i) => i.state === "ESCALATED" || i.state === "RESOLUTION_IN_PROGRESS").length;

  useEffect(() => {
    if (user?.role === "resolver") router.replace("/resolver");
  }, [user, router]);

  return (
    <AppShell title={`Hello, ${user?.username ?? "there"}`} subtitle={user?.store_name}>
      <Reveal>
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-hero-from to-hero-to p-6 text-white shadow-lg shadow-primary/20">
          <motion.div className="pointer-events-none absolute -right-10 -top-10 size-44 rounded-full bg-white/10" animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} />
          <motion.div className="pointer-events-none absolute -bottom-16 right-10 size-36 rounded-full bg-white/5" animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} />
          <div className="relative">
            <Badge className="bg-white/15 text-white hover:bg-white/15">
              <ScanSearch /> Photo Match
            </Badge>
            <h2 className="mt-3 text-2xl font-bold leading-snug">Found an item with a missing ticket?</h2>
            <p className="mt-1 max-w-sm text-sm text-white/75">Take up to five photos. We check quality and read the item details for you.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.15, ease: EASE }}>
                <Button render={<Link href="/capture" onClick={resetCapture} />} nativeButton={false} size="lg" className="bg-white text-hero-from hover:bg-white/90">
                  <Camera /> Start capturing
                </Button>
              </motion.div>
              <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.15, ease: EASE }}>
                <Button render={<Link href="/quick-scan" />} nativeButton={false} size="lg" variant="ghost" className="bg-white/15 text-white hover:bg-white/25 hover:text-white">
                  <ScanBarcode /> Quick scan
                </Button>
              </motion.div>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal delay={0.1} className="mt-4 grid grid-cols-2 gap-3">
        <Card size="sm">
          <CardContent>
            <p className="text-xs font-medium text-muted-foreground">Tickets created</p>
            <p className="mt-1 text-3xl font-bold"><CountUp value={items.length} /></p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-xs font-medium text-muted-foreground">Labels printed</p>
            <p className="mt-1 text-3xl font-bold"><CountUp value={printed} /></p>
          </CardContent>
        </Card>
      </Reveal>

      <Reveal delay={0.12} className="mt-3">
        <Link href="/inbox" className="block">
          <Card size="sm" className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-3">
              <span className="relative grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <InboxIcon size={18} />
                {unread ? <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-destructive text-[10px] font-bold text-white">{unread}</span> : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Inbox</p>
                <p className="text-sm text-muted-foreground">{waiting ? `${waiting} waiting for a resolver` : "Tickets and resolver answers"}</p>
              </div>
              <ChevronRight size={18} className="text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </Reveal>

      <Reveal delay={0.15} className="mt-3">
        <Link href="/library" className="block">
          <Card size="sm" className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Library size={18} /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Catalog</p>
                <p className="text-sm text-muted-foreground">{libraryCount === 0 ? "Add products with photos to match against" : `${libraryCount} item${libraryCount === 1 ? "" : "s"} searchable by photo`}</p>
              </div>
              <ChevronRight size={18} className="text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </Reveal>

      <div className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent tickets</h2>
        {incidentsLoading ? (
          <ListSkeleton rows={3} />
        ) : items.length === 0 ? (
          <Reveal delay={0.15}>
            <Card className="border border-dashed ring-0">
              <CardContent className="grid place-items-center gap-2 py-4 text-center">
                <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary"><Ticket size={20} /></span>
                <p className="font-semibold">No tickets yet</p>
                <p className="text-sm text-muted-foreground">Your first capture will show up here.</p>
              </CardContent>
            </Card>
          </Reveal>
        ) : (
          <StaggerList className="space-y-2.5">
            {items.slice(0, 8).map((t) => {
              return (
                <StaggerListItem key={t.id} whileTap={{ scale: 0.985 }}>
                  <Link href={`/incident/${t.id}`} className="block">
                    <Card size="sm" className="transition-shadow hover:shadow-md">
                      <CardContent className="flex items-center gap-3">
                        <SafeImg src={t.thumb} className="size-14 shrink-0 rounded-xl" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">{t.number_display}</p>
                            <StateBadge s={t} />
                            {t.lane === "FAST_LANE" ? <Badge variant="outline">Quick scan</Badge> : null}
                          </div>
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">{t.summary}</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(t.created_at)}</p>
                        </div>
                        <ChevronRight size={18} className="text-muted-foreground" />
                      </CardContent>
                    </Card>
                  </Link>
                </StaggerListItem>
              );
            })}
          </StaggerList>
        )}
      </div>
    </AppShell>
  );
}
