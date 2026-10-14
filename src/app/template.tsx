"use client";

import { motion } from "motion/react";
import { EASE } from "@/components/motion";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div className="flex flex-1 flex-col" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
      {children}
    </motion.div>
  );
}
