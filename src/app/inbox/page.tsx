"use client";

import { ChevronRight, Inbox as InboxIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { SafeImg } from "@/components/safe-img";
import { StaggerList, StaggerListItem } from "@/components/motion";
import { PriorityBadge, StateBadge } from "@/components/status";
import { Card, CardContent } from "@/components/ui/card";
import { ListSkeleton } from "@/components/skeletons";
import { PillTabs } from "@/components/pill-tabs";
import { INBOX_TABS, inTab, timeAgo, type InboxTab } from "@/lib/inbox";
import { useIncidents } from "@/lib/queries";
import type { IncidentSummary } from "@/lib/types";

function Row({ t }: { t: IncidentSummary }) {
  return (
    <Link href={`/incident/${t.id}`} className="block">
      <Card size="sm" className="transition-shadow hover:shadow-md">
        <CardContent className="flex items-center gap-3">
          <SafeImg src={t.thumb} className="size-14 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-bold uppercase">{t.title}</p>
              {t.unread ? <span className="size-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
            </div>
            <p className="truncate text-sm text-muted-foreground">#{t.short_number}{t.department ? ` · Dept ${t.department}` : ""}{t.lane === "FAST_LANE" ? " · Quick scan" : ""}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <StateBadge s={t} />
            <div className="flex items-center gap-1.5">
              <PriorityBadge priority={t.priority} />
              <span className="text-xs text-muted-foreground">{timeAgo(t.updated_at)}</span>
            </div>
          </div>
          <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}

export default function InboxPage() {
  const { data, isLoading } = useIncidents();
  const [tab, setTab] = useState<InboxTab>("all");
  const items = data?.items ?? [];
  const list = items.filter((i) => inTab(i, tab));

  return (
    <AppShell title="Inbox" subtitle="Tickets and resolver answers." back="/">
      <PillTabs
        id="inbox"
        value={tab}
        onChange={setTab}
        tabs={INBOX_TABS.map((t) => ({ key: t.key, label: t.label, count: t.key === "all" ? undefined : items.filter((i) => inTab(i, t.key)).length, highlight: t.key === "unread" }))}
      />
      <div className="mt-4">
        {isLoading ? (
          <ListSkeleton />
        ) : list.length === 0 ? (
          <Card className="border border-dashed ring-0">
            <CardContent className="grid place-items-center gap-2 py-8 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary"><InboxIcon size={20} /></span>
              <p className="font-semibold">Nothing here</p>
              <p className="text-sm text-muted-foreground">Tickets in this group will show up here.</p>
            </CardContent>
          </Card>
        ) : (
          <StaggerList key={tab} className="space-y-2.5">
            {list.map((i) => (
              <StaggerListItem key={i.id}><Row t={i} /></StaggerListItem>
            ))}
          </StaggerList>
        )}
      </div>
    </AppShell>
  );
}
