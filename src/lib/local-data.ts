import type { QueryClient } from "@tanstack/react-query";
import { useCapture } from "@/store/capture";
import { useQcSelection } from "@/store/qc";

let queryClient: QueryClient | null = null;

/** Lets sign-out reach the app's data cache from outside React. */
export function registerQueryClient(client: QueryClient) {
  queryClient = client;
}

/** The only thing kept across a sign-out: how the app looks on this device. It says nothing about who used it. */
const KEEP = new Set(["theme"]);

/**
 * Removes everything this browser remembers about the signed-in user: the data the screens loaded, photos taken but not sent,
 * the ticked shipments, saved storage and the offline copies. The first part runs at once, before any waiting.
 */
export async function clearLocalData(): Promise<void> {
  queryClient?.cancelQueries();
  queryClient?.clear();
  useCapture.getState().reset();
  useQcSelection.getState().clear();
  try {
    for (const key of Object.keys(localStorage)) if (!KEEP.has(key)) localStorage.removeItem(key);
    sessionStorage.clear();
  } catch {
    // storage can be blocked; there is nothing to clear then
  }
  try {
    if ("caches" in globalThis) await Promise.all((await caches.keys()).map((name) => caches.delete(name)));
  } catch {
    // no cache storage here
  }
}
