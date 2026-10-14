"use client";

import { useRouter } from "next/navigation";
import { use, useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { PrintPanel } from "@/components/print-panel";
import { TicketSkeleton } from "@/components/skeletons";
import { Card, CardContent } from "@/components/ui/card";
import { useIncident } from "@/lib/queries";

export default function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: d } = useIncident(id);

  useEffect(() => {
    if (d && d.state !== "CONFIRMED" && d.state !== "PRINTED") router.replace(`/incident/${id}`);
  }, [d, id, router]);

  if (!d?.selected) {
    return <AppShell title="Print tag" back={`/incident/${id}`}><TicketSkeleton /></AppShell>;
  }
  return (
    <AppShell title="Print tag" subtitle={d.number_display} back={`/incident/${id}`}>
      <Card><CardContent><PrintPanel d={d} /></CardContent></Card>
    </AppShell>
  );
}
