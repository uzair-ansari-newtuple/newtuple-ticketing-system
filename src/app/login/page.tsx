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
      router.replace("/apps");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row">
      <section className="flex flex-col justify-between bg-brand px-6 pb-10 pt-[max(2rem,env(safe-area-inset-top))] text-white lg:w-1/2 lg:px-16 lg:py-16">
        <Reveal><LogoOnDark size="lg" /></Reveal>
        <div className="mt-12 lg:mt-0">
          <Reveal delay={0.1}>
            <h1 className="text-4xl font-extralight leading-[1.1] tracking-tight lg:text-6xl">
              Receive it right.
              <br />
              Tag it right.
            </h1>
            <p className="mt-4 max-w-md text-sm font-light leading-relaxed text-white/80 lg:text-base">One place for the distribution center floor and the store.</p>
          </Reveal>
          <Stagger className="mt-10">
            <ul className="space-y-5 text-sm text-white/85">
              {APPS.map(({ icon: Icon, title, text }) => (
                <StaggerListItem key={title} className="flex max-w-md items-start gap-3">
                  <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-white/25">
                    <Icon size={20} strokeWidth={1.5} />
                  </span>
                  <span>
                    <span className="block text-base font-semibold text-white">{title}</span>
                    <span className="mt-1 block font-light leading-relaxed text-white/80">{text}</span>
                  </span>
                </StaggerListItem>
              ))}
            </ul>
          </Stagger>
        </div>
      </section>

      <section className="flex flex-1 items-center justify-center bg-white px-6 py-12 text-gray-900">
        <Reveal delay={0.15} className="w-full max-w-sm">
          <form onSubmit={submit}>
            <h2 className="text-3xl font-light tracking-tight">Sign in</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">Use the account you were given to open DC QC and Ticketing.</p>

            <div className="mt-8 space-y-2">
              <Label htmlFor="email" className="text-xs font-medium uppercase tracking-wider text-gray-600">Email <span className="text-destructive" aria-hidden>*</span></Label>
              <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" autoComplete="email" type="email" required placeholder="you@company.com" className="h-12 px-4 dark:border-gray-300 dark:bg-white dark:text-gray-900 dark:placeholder:text-gray-500" />
            </div>
            <div className="mt-4 space-y-2">
              <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-gray-600">Password <span className="text-destructive" aria-hidden>*</span></Label>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required placeholder="Enter your password" className="h-12 px-4 pr-12 dark:border-gray-300 dark:bg-white dark:text-gray-900 dark:placeholder:text-gray-500" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900">
                  {showPassword ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}
                </button>
              </div>
            </div>

            <Button type="submit" size="lg" disabled={busy} className="mt-8 w-full bg-brand text-white hover:bg-[#0055cc] active:bg-[#003380]">
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
