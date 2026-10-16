"use client";

import { ArrowRight, ClipboardCheck, Eye, EyeOff, Loader2, ScanSearch } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LogoOnDark } from "@/components/logo";
import { Reveal, Stagger, StaggerListItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useSession } from "@/store/session";

const APPS = [
  { icon: ClipboardCheck, title: "DC QC", text: "Check each shipment against its PO, UPC by UPC. Count pallets, photograph the goods and flag exceptions." },
  { icon: ScanSearch, title: "Ticketing", text: "Photograph an item with a missing tag, match it to the catalog and print a new tag in seconds." },
];

export default function LoginPage() {
  const router = useRouter();
  const token = useSession((s) => s.token);
  const signIn = useSession((s) => s.signIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (token) router.replace("/apps");
  }, [token, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.login(email, password);
      if (res.user.role === "resolver") {
        toast.error("Resolvers work tickets in the State Machine, not in this app");
        return;
      }
      signIn(res);
      toast.success("Signed in");
      router.replace("/apps");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row">
      <section className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-hero-from to-hero-to px-6 pb-10 pt-[max(2rem,env(safe-area-inset-top))] text-white lg:w-1/2 lg:px-14 lg:py-14">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full bg-white/5" />
        <Reveal className="relative"><LogoOnDark size="lg" /></Reveal>
        <div className="relative mt-10 lg:mt-0">
          <Reveal delay={0.1}>
            <h1 className="text-3xl font-bold leading-tight tracking-tight lg:text-5xl">
              Receive it right.
              <br />
              Tag it right.
            </h1>
            <p className="mt-3 max-w-md text-sm text-white/75 lg:text-base">One place for the distribution center floor and the store.</p>
          </Reveal>
          <Stagger className="mt-8">
            <ul className="space-y-4 text-sm text-white/85">
              {APPS.map(({ icon: Icon, title, text }) => (
                <StaggerListItem key={title} className="flex max-w-md items-start gap-3">
                  <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-white/15">
                    <Icon size={20} />
                  </span>
                  <span>
                    <span className="block text-base font-semibold text-white">{title}</span>
                    <span className="mt-0.5 block leading-relaxed text-white/75">{text}</span>
                  </span>
                </StaggerListItem>
              ))}
            </ul>
          </Stagger>
        </div>
      </section>

      <section className="flex flex-1 items-center justify-center px-6 py-10">
        <Reveal delay={0.15} className="w-full max-w-sm">
          <form onSubmit={submit}>
            <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to DC QC and Ticketing with the account you were given.</p>

            <div className="mt-6 space-y-2">
              <Label htmlFor="email">Email <span className="text-destructive" aria-hidden>*</span></Label>
              <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" autoComplete="email" type="email" required placeholder="you@company.com" className="h-11" />
            </div>
            <div className="mt-4 space-y-2">
              <Label htmlFor="password">Password <span className="text-destructive" aria-hidden>*</span></Label>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required placeholder="Enter your password" className="h-11 pr-11" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button type="submit" size="lg" disabled={busy} className="mt-6 w-full">
              {busy ? <Loader2 className="animate-spin" /> : null}
              {busy ? "Signing in" : "Continue"}
              {!busy ? <ArrowRight /> : null}
            </Button>
          </form>
        </Reveal>
      </section>
    </div>
  );
}
