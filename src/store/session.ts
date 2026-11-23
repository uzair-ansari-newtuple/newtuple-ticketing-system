import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clearLocalData } from "@/lib/local-data";
import type { LoginResponse } from "@/lib/types";

interface SessionState {
  token: string | null;
  refreshToken: string | null;
  user: LoginResponse["user"] | null;
  signIn: (res: LoginResponse) => void;
  setTokens: (token: string, refreshToken: string) => void;
  setUser: (user: LoginResponse["user"]) => void;
  signOut: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      signIn: (res) => set({ token: res.access_token, refreshToken: res.refresh_token, user: res.user }),
      setTokens: (token, refreshToken) => set({ token, refreshToken }),
      setUser: (user) => set({ user }),
      signOut: () => {
        const { token, refreshToken } = get();
        set({ token: null, refreshToken: null, user: null });
        // End the session on the server too. keepalive lets the request finish even while the page changes.
        if (token || refreshToken) {
          fetch("/api/mock/auth/logout", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ refresh_token: refreshToken }) }).catch(() => undefined);
        }
        void clearLocalData();
      },
    }),
    {
      name: "ticketing-session",
      version: 3,
      // Earlier sessions used the app's own tokens, which no longer work. Drop them and ask the user to sign in again.
      migrate: (persisted) => ({ ...(persisted as object), token: null, refreshToken: null, user: null }),
    },
  ),
);
