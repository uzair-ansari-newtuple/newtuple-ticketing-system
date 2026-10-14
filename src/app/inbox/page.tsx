"use client";

import { Inbox as InboxIcon } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { StaggerList, StaggerListItem } from "@/components/motion";
import { Card, CardContent } from "@/components/ui/card";
import { ListSkeleton } from "@/components/skeletons";
import { PillTabs } from "@/components/pill-tabs";
import { TicketRow } from "@/components/ticket-row";
import { INBOX_TABS, inTab, type InboxTab } from "@/lib/inbox";
import { useIncidents } from "@/lib/queries";

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
              <StaggerListItem key={i.id}><TicketRow t={i} /></StaggerListItem>
            ))}
          </StaggerList>
        )}
      </div>
    </AppShell>
  );
}
