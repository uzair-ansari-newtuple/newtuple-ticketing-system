"use client";

import { motion } from "motion/react";
import { useEffect, useRef } from "react";

export interface PillTab<K extends string> {
  key: K;
  label: string;
  count?: number;
  highlight?: boolean;
}

/** Horizontally scrolling pill tabs with an animated active pill, count badges and faded edges. */
export function PillTabs<K extends string>({ tabs, value, onChange, id }: { tabs: PillTab<K>[]; value: K; onChange: (key: K) => void; id: string }) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [value]);

  return (
    <div className="-mx-4 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)]">
      <div role="tablist" className="flex snap-x gap-2 overflow-x-auto px-4 pb-1 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => {
          const active = t.key === value;
          return (
            <button
              key={t.key}
              ref={active ? activeRef : undefined}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.key)}
              className={`relative flex h-10 shrink-0 snap-center items-center gap-2 rounded-full border px-4 text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${active ? "border-transparent text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
            >
              {active ? <motion.span layoutId={`${id}-pill`} className="absolute inset-0 rounded-full bg-primary shadow-md shadow-primary/25" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
              <span className="relative">{t.label}</span>
              {t.count ? (
                <span className={`relative grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold leading-5 ${active ? "bg-white/25 text-primary-foreground" : t.highlight ? "bg-destructive text-white" : "bg-muted text-foreground"}`}>
                  {t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
