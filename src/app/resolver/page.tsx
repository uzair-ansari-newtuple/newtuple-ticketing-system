"use client";

import { ChevronRight, Inbox as InboxIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { SafeImg } from "@/components/safe-img";
import { StaggerList, StaggerListItem } from "@/components/motion";
import { PillTabs } from "@/components/pill-tabs";
import { StateBadge } from "@/components/status";
import { Card, CardContent } from "@/components/ui/card";
import { ListSkeleton } from "@/components/skeletons";
import { formatDateTime } from "@/lib/format";
import { useResolverQueue } from "@/lib/queries";
import type { IncidentSummary, ResolverState } from "@/lib/types";

const TABS: { key: ResolverState["status"]; label: string }[] = [
  { key: "NEW", label: "New" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "RESOLVED", label: "Resolved" },
];

function Row({ t }: { t: IncidentSummary }) {
  return (
    <Link href={`/resolver/${t.id}`} className="block">
      <Card size="sm" className="transition-shadow hover:shadow-md">
        <CardContent className="flex items-center gap-3">
          <SafeImg src={t.thumb} className="size-14 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold">{t.number_display}</p>
              <StateBadge s={t} />
            </div>
            <p className="truncate text-sm text-muted-foreground">{t.summary} · {t.store_id}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(t.updated_at)}</p>
          </div>
          <ChevronRight size={18} className="text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}

export default function ResolverQueuePage() {
  const { data, isLoading } = useResolverQueue();
  const [tab, setTab] = useState<ResolverState["status"]>("NEW");
  const items = data?.items ?? [];
  const list = items.filter((i) => i.resolver_status === tab);

  return (
    <AppShell role="resolver" title="Resolver desk" subtitle="Tickets stores asked for help with.">
      <PillTabs id="resolver" value={tab} onChange={setTab} tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: items.filter((i) => i.resolver_status === t.key).length }))} />
      <div className="mt-4">
        {isLoading ? (
          <ListSkeleton />
        ) : list.length === 0 ? (
          <Card className="border border-dashed ring-0">
            <CardContent className="grid place-items-center gap-2 py-8 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary"><InboxIcon size={20} /></span>
              <p className="font-semibold">Nothing here</p>
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
