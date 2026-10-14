"use client";

import { ArrowRight, Eye, EyeOff, Loader2, ScanSearch, ShieldCheck, Ticket } from "lucide-react";
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

const FEATURES = [
  { icon: ShieldCheck, text: "Instant image quality checks" },
  { icon: ScanSearch, text: "Item details read from the photo" },
  { icon: Ticket, text: "Tickets created in seconds" },
];

export default function LoginPage() {
  const router = useRouter();
  const token = useSession((s) => s.token);
  const signIn = useSession((s) => s.signIn);
  const [provider, setProvider] = useState<"local" | "state-machine" | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const role = useSession((s) => s.user?.role);
  const viaStateMachine = provider === "state-machine";

  useEffect(() => {
    api.loginProvider().then((p) => {
      setProvider(p);
      if (p === "local") {
        setUsername("store112");
        setPassword("store123");
      }
    }).catch(() => setProvider("local"));
  }, []);

  useEffect(() => {
    if (token) router.replace(role === "resolver" ? "/resolver" : "/");
  }, [token, role, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.login(username, password);
      signIn(res);
      toast.success("Signed in");
      router.replace(res.user.role === "resolver" ? "/resolver" : "/");
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
        <Reveal className="relative"><LogoOnDark className="h-6" /></Reveal>
        <div className="relative mt-10 lg:mt-0">
          <Reveal delay={0.1}>
            <h1 className="text-3xl font-bold leading-tight tracking-tight lg:text-5xl">
              Missing ticket?
              <br />
              Snap it. Sort it.
            </h1>
          </Reveal>
          <Stagger className="mt-6">
            <ul className="space-y-3 text-sm text-white/85">
              {FEATURES.map(({ icon: Icon, text }) => (
                <StaggerListItem key={text} className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-lg bg-white/15">
                    <Icon size={16} />
                  </span>
                  {text}
                </StaggerListItem>
              ))}
            </ul>
          </Stagger>
        </div>
        <p className="relative mt-10 hidden text-xs text-white/50 lg:block">Demo build · all data is mocked</p>
      </section>

      <section className="flex flex-1 items-center justify-center px-6 py-10">
        <Reveal delay={0.15} className="w-full max-w-sm">
          <form onSubmit={submit}>
            <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">{viaStateMachine ? "Use your State Machine account." : "Use the demo account to explore the flow."}</p>

            <div className="mt-6 space-y-2">
              <Label htmlFor="username">{viaStateMachine ? "Email" : "Username"} <span className="text-destructive" aria-hidden>*</span></Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoComplete="username" type={viaStateMachine ? "email" : "text"} required placeholder={viaStateMachine ? "you@company.com" : "Enter your username"} className="h-11" />
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

            {provider === "local" ? <div className="mt-4 flex gap-2 text-xs">
              <button type="button" className="rounded-full bg-muted px-3 py-1.5 font-medium" onClick={() => { setUsername("store112"); setPassword("store123"); }}>Store demo</button>
              <button type="button" className="rounded-full bg-muted px-3 py-1.5 font-medium" onClick={() => { setUsername("resolver1"); setPassword("resolver123"); }}>Resolver demo</button>
            </div> : null}

            <Button type="submit" size="lg" disabled={busy || !provider} className="mt-6 w-full">
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
