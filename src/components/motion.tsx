"use client";

import { animate, motion, useInView, useMotionValue, useTransform, type HTMLMotionProps, type Variants } from "motion/react";
import { useEffect, useRef } from "react";

export const EASE = [0.22, 1, 0.36, 1] as const;

export function Reveal({ delay = 0, y = 14, ...props }: HTMLMotionProps<"div"> & { delay?: number; y?: number }) {
  return <motion.div initial={{ opacity: 0, y }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay }} {...props} />;
}

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } };
const item: Variants = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } } };

export function Stagger(props: HTMLMotionProps<"div">) {
  return <motion.div variants={container} initial="hidden" animate="show" {...props} />;
}

export function StaggerList(props: HTMLMotionProps<"ul">) {
  return <motion.ul variants={container} initial="hidden" animate="show" {...props} />;
}

export function StaggerItem(props: HTMLMotionProps<"div">) {
  return <motion.div variants={item} {...props} />;
}

export function StaggerListItem(props: HTMLMotionProps<"li">) {
  return <motion.li variants={item} {...props} />;
}

export function CountUp({ value, suffix = "", className }: { value: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${Math.round(v)}${suffix}`);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, value, { duration: 0.9, ease: EASE });
    return () => controls.stop();
  }, [inView, mv, value]);

  return (
    <motion.span ref={ref} className={className}>
      {text}
    </motion.span>
  );
}

export function ConfidenceRing({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const r = 26;
  const c = 2 * Math.PI * r;
  const color = pct >= 85 ? "var(--success)" : pct >= 70 ? "var(--warning)" : "var(--destructive)";
  return (
    <div className="relative size-16 shrink-0" role="img" aria-label={`Confidence ${pct}%`}>
      <svg viewBox="0 0 64 64" className="size-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--muted)" strokeWidth="6" />
        <motion.circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value) }}
          transition={{ duration: 1, ease: EASE, delay: 0.2 }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-bold">
        <CountUp value={pct} suffix="%" />
      </span>
    </div>
  );
}
