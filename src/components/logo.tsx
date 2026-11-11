/** A price tag with a barcode on it: the thing this app keeps in place. */
function TagMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 6A2.5 2.5 0 0 1 6 3.5h5.6a2 2 0 0 1 1.4.6l7.4 7.4a2 2 0 0 1 0 2.8l-5.9 5.9a2 2 0 0 1-2.8 0L4.1 13a2 2 0 0 1-.6-1.4z" />
      <circle cx="7.6" cy="7.6" r="1.1" />
      <g transform="rotate(45 13 13)"><path d="M10.5 11v4M13 10v6M15.5 11v4" /></g>
    </svg>
  );
}

type Size = "sm" | "lg";

const SIZES: Record<Size, { mark: string; icon: number; text: string }> = {
  sm: { mark: "size-8 rounded-lg", icon: 20, text: "text-lg" },
  lg: { mark: "size-11 rounded-xl", icon: 26, text: "text-3xl" },
};

function Wordmark({ size, onDark }: { size: Size; onDark: boolean }) {
  const s = SIZES[size];
  return (
    <span role="img" aria-label="Retail Ops" className="inline-flex items-center gap-2 font-bold leading-none tracking-tight">
      <span className={`grid place-items-center ${s.mark} ${onDark ? "bg-white/15 text-white" : "bg-primary text-primary-foreground"}`}>
        <TagMark size={s.icon} />
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
