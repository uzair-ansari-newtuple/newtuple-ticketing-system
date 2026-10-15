import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LoginResponse } from "@/lib/types";

interface SessionState {
  token: string | null;
  refreshToken: string | null;
  user: LoginResponse["user"] | null;
  signIn: (res: LoginResponse) => void;
  setTokens: (token: string, refreshToken: string) => void;
  signOut: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      signIn: (res) => set({ token: res.access_token, refreshToken: res.refresh_token, user: res.user }),
      setTokens: (token, refreshToken) => set({ token, refreshToken }),
      signOut: () => set({ token: null, refreshToken: null, user: null }),
    }),
    {
      name: "ticketing-session",
      version: 3,
      // Earlier sessions used the app's own tokens, which no longer work. Drop them and ask the user to sign in again.
      migrate: (persisted) => ({ ...(persisted as object), token: null, refreshToken: null, user: null }),
    },
  ),
);
