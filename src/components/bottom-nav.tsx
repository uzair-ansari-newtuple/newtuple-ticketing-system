"use client";

import { Camera, Home, Inbox } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIncidents } from "@/lib/queries";
import { useCapture } from "@/store/capture";

const ITEMS = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
  { href: "/capture", label: "Capture", icon: Camera, match: (p: string) => p.startsWith("/capture") || p.startsWith("/review"), primary: true },
  { href: "/inbox", label: "Inbox", icon: Inbox, match: (p: string) => p.startsWith("/inbox") || p.startsWith("/incident") },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const { data } = useIncidents();
  const resetCapture = useCapture((s) => s.reset);
  const unread = (data?.items ?? []).filter((i) => i.unread).length;

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <ul className="mx-auto grid h-16 max-w-2xl grid-cols-3 items-end px-2">
        {ITEMS.map(({ href, label, icon: Icon, match, ...rest }) => {
          const active = match(pathname);
          const primary = "primary" in rest;
          return (
            <li key={href} className="flex justify-center">
              <Link
                href={href}
                onClick={primary ? resetCapture : undefined}
                aria-current={active ? "page" : undefined}
                className="group relative flex w-full flex-col items-center justify-end gap-0.5 pb-2 text-[11px] font-medium outline-none"
              >
                {primary ? (
                  <motion.span whileTap={{ scale: 0.92 }} className="-mt-6 mb-0.5 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background">
                    <Icon size={24} />
                  </motion.span>
                ) : (
                  <motion.span whileTap={{ scale: 0.9 }} className="relative grid h-8 w-14 place-items-center">
                    {active ? <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-primary/12" transition={{ type: "spring", stiffness: 420, damping: 32 }} /> : null}
                    <Icon size={21} className={`relative transition-colors ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                    {href === "/inbox" && unread ? <span className="absolute right-2 top-0 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-white">{unread}</span> : null}
                  </motion.span>
                )}
                <span className={active || primary ? "text-primary" : "text-muted-foreground"}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
