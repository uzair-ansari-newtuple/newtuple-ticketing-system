"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { SafeImg } from "@/components/safe-img";
import { PriorityBadge, StateBadge } from "@/components/status";
import { Card, CardContent } from "@/components/ui/card";
import { timeAgo } from "@/lib/inbox";
import type { IncidentSummary } from "@/lib/types";

export function TicketRow({ t }: { t: IncidentSummary }) {
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
