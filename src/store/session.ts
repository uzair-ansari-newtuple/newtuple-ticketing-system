import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LoginResponse } from "@/lib/types";

interface SessionState {
  token: string | null;
  user: LoginResponse["user"] | null;
  signIn: (res: LoginResponse) => void;
  signOut: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      signIn: (res) => set({ token: res.access_token, user: res.user }),
      signOut: () => set({ token: null, user: null }),
    }),
    {
      name: "ticketing-session",
      version: 2,
      // v1 sessions had no role, so they would never pass the role guard. Drop them and ask the user to sign in again.
      migrate: (persisted) => ({ ...(persisted as object), token: null, user: null }),
    },
  ),
);
