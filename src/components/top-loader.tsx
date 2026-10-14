"use client";

import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";

/** Thin indeterminate bar under the header whenever data is loading or saving. */
export function TopLoader() {
  const busy = useIsFetching() + useIsMutating() > 0;
  return (
    <AnimatePresence>
      {busy ? (
        <motion.div key="loader" className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-primary/15" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.3 } }} role="progressbar" aria-label="Loading">
          <motion.div className="h-full w-1/3 rounded-full bg-primary" animate={{ x: ["-100%", "320%"] }} transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
