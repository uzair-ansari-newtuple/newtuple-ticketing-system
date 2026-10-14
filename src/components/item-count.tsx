"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const MIN = 1;
const MAX = 99;

/** How many items have a missing tag. One label prints per item. */
export function ItemCount({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border bg-card p-3">
      <div>
        <p className="text-sm font-semibold">How many items?</p>
        <p className="text-xs text-muted-foreground">One tag prints for each</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Fewer items" disabled={value <= MIN} onClick={() => onChange(value - 1)}><Minus /></Button>
        <span className="w-8 text-center text-lg font-bold" aria-live="polite">{value}</span>
        <Button variant="outline" size="icon" aria-label="More items" disabled={value >= MAX} onClick={() => onChange(value + 1)}><Plus /></Button>
      </div>
    </div>
  );
}
