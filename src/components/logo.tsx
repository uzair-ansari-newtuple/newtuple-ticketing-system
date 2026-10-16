import { Store } from "lucide-react";

type Size = "sm" | "lg";

const SIZES: Record<Size, { mark: string; icon: number; text: string }> = {
  sm: { mark: "size-7 rounded-lg", icon: 16, text: "text-lg" },
  lg: { mark: "size-10 rounded-xl", icon: 22, text: "text-3xl" },
};

function Wordmark({ size, onDark }: { size: Size; onDark: boolean }) {
  const s = SIZES[size];
  return (
    <span role="img" aria-label="Retail Ops" className="inline-flex items-center gap-2 font-bold leading-none tracking-tight">
      <span className={`grid place-items-center ${s.mark} ${onDark ? "bg-white/15 text-white" : "bg-primary text-primary-foreground"}`}>
        <Store size={s.icon} aria-hidden />
      </span>
      <span className={`${s.text} ${onDark ? "text-white" : "text-foreground"}`}>
        Retail<span className={onDark ? "text-white/70" : "text-primary"}> Ops</span>
      </span>
    </span>
  );
}

/** The product name on a light or dark page. */
export function Logo({ size = "sm" }: { size?: Size }) {
  return <Wordmark size={size} onDark={false} />;
}

/** The product name on the blue panel. */
export function LogoOnDark({ size = "lg" }: { size?: Size }) {
  return <Wordmark size={size} onDark />;
}
