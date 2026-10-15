"use client";

import { AlertTriangle, ClipboardList } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFlagged } from "@/lib/qc/queries";

export function QcNav() {
  const pathname = usePathname();
  const open = (useFlagged().data?.items ?? []).filter((u) => u.state === "SUPERVISOR_HOLD").length;
  const items = [
    { href: "/qc", label: "Shipments", icon: ClipboardList, active: !pathname.startsWith("/qc/exceptions") },
    { href: "/qc/exceptions", label: "Exceptions", icon: AlertTriangle, active: pathname.startsWith("/qc/exceptions"), badge: open },
  ];

  return (
    <nav aria-label="DC QC" className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <ul className="mx-auto grid h-16 max-w-2xl grid-cols-2 items-end px-2 md:max-w-4xl">
        {items.map(({ href, label, icon: Icon, active, badge }) => (
          <li key={href} className="flex justify-center">
            <Link href={href} aria-current={active ? "page" : undefined} className="group relative flex w-full flex-col items-center justify-end gap-0.5 pb-2 text-[11px] font-medium outline-none">
              <motion.span whileTap={{ scale: 0.9 }} className="relative grid h-8 w-14 place-items-center">
                {active ? <motion.span layoutId="qc-nav-pill" className="absolute inset-0 rounded-full bg-primary/12" transition={{ type: "spring", stiffness: 420, damping: 32 }} /> : null}
                <Icon size={21} className={`relative transition-colors ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                {badge ? <span className="absolute right-2 top-0 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-white">{badge}</span> : null}
              </motion.span>
              <span className={active ? "text-primary" : "text-muted-foreground"}>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
