/**
 * In-memory Signal C cache — one snapshot per tick (M4.9).
 * `{ get, set }` shape allows a Supabase adapter in M4.7 without API churn.
 */
import type { Signals } from "@agent-town/shared";

export type SignalCache = {
  get: (tickKey: string) => Signals | undefined;
  set: (tickKey: string, value: Signals) => void;
  clear: () => void;
};

export function createInMemorySignalCache(): SignalCache {
  const store = new Map<string, Signals>();
  return {
    get: (tickKey) => store.get(tickKey),
    set: (tickKey, value) => {
      store.set(tickKey, value);
    },
    clear: () => {
      store.clear();
    },
  };
}

/** Stable cache key: explicit tick or a process-wide default. */
export function tickCacheKey(tick?: number): string {
  return tick === undefined ? "default" : String(tick);
}
