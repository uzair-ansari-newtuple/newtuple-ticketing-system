"use client";

import { ArrowLeft, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { EASE } from "@/components/motion";
import { BottomNav } from "@/components/bottom-nav";
import { Logo } from "@/components/logo";
import { TopLoader } from "@/components/top-loader";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/store/session";

interface AppShellProps {
  title: string;
  subtitle?: string;
  back?: string;
  footer?: React.ReactNode;
  role?: "store" | "resolver";
  nav?: boolean;
  children: React.ReactNode;
}

export function AppShell({ title, subtitle, back, footer, role = "store", nav = true, children }: AppShellProps) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const token = useSession((s) => s.token);
  const user = useSession((s) => s.user);
  const signOut = useSession((s) => s.signOut);
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!hydrated) return;
    if (!token) router.replace("/login");
    else if (user && user.role !== role) router.replace(user.role === "resolver" ? "/resolver" : "/");
  }, [hydrated, token, user, role, router]);

  if (!hydrated || !token || (user && user.role !== role)) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 pt-20">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const showNav = nav && role === "store";
  const initials = (user?.name ?? "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className={`flex min-h-dvh flex-1 flex-col ${showNav ? "pb-[calc(4rem+env(safe-area-inset-bottom))]" : ""}`}>
      <header className="sticky top-0 z-30 border-b bg-background/75 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-2 px-4">
          {back ? (
            <Button render={<Link href={back} />} nativeButton={false} variant="ghost" size="icon" aria-label="Back" className="-ml-2">
              <ArrowLeft />
            </Button>
          ) : null}
          <Link href={role === "resolver" ? "/resolver" : "/"} aria-label="Home" className="flex items-center">
            <Logo className="h-4" />
          </Link>
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label="Account menu">
              <Avatar className="size-9">
                <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <p className="font-semibold text-foreground">{user?.name}</p>
                  <p className="text-xs font-normal text-muted-foreground">{user?.store_name}</p>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setTheme("light")}><Sun /> Light</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")}><Moon /> Dark</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("system")}><Monitor /> System</DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    signOut();
                    router.replace("/login");
                  }}
                >
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <TopLoader />
      </header>

      <main className={`mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-8`}>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </motion.div>
        {children}
      </main>

      {footer ? (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: EASE, delay: 0.1 }}
          className={`sticky z-30 border-t bg-background/85 pt-3 backdrop-blur-xl ${showNav ? "bottom-[calc(4rem+env(safe-area-inset-bottom))] pb-3" : "bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]"}`}
        >
          <div className="mx-auto w-full max-w-2xl px-4">{footer}</div>
        </motion.div>
      ) : null}
      {showNav ? <BottomNav /> : null}
    </div>
  );
}
