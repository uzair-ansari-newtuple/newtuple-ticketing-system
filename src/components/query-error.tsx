"use client";

import { CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Shown when a request fails, so a failure never looks like "no data". */
export function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const detail = error instanceof Error ? error.message : "Something went wrong";
  return (
    <Card className="ring-2 ring-destructive/25">
      <CardContent className="grid place-items-center gap-2 py-6 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-destructive/10 text-destructive"><CloudOff size={20} /></span>
        <p className="font-semibold">Couldn&apos;t load this</p>
        <p className="max-w-xs text-sm text-muted-foreground">{detail}. Check your connection and that the app can reach the database.</p>
        <Button variant="outline" onClick={onRetry}>Try again</Button>
      </CardContent>
    </Card>
  );
}
