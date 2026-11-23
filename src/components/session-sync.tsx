"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/store/session";

const SAME = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Keeps the saved user in step with the State Machine. The user is saved at sign-in, so a store assigned (or lost)
 * afterwards would otherwise stay wrong until the next sign-in. Runs when the app opens, when a new token arrives
 * and when the window comes back into focus. A failed call changes nothing.
 */
export function SessionSync() {
  const token = useSession((s) => s.token);

  useEffect(() => {
    if (!token) return;
    let stopped = false;
    const sync = () => {
      const current = useSession.getState().token;
      if (!current || document.visibilityState === "hidden") return;
      api
        .me(current)
        .then(({ user }) => {
          const saved = useSession.getState().user;
          if (!stopped && (!saved || !SAME(saved, user))) useSession.getState().setUser(user);
        })
        .catch(() => undefined);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", sync);
    };
  }, [token]);

  return null;
}
