/**
 * Signal C fetch — external lending APY + DEX volume (ARCHITECTURE §5.1, M4.9).
 * Per-tick cache, 5s timeout, last-known stale fallback; never throws to callers.
 */
import {
  EXTERNAL_SIGNAL_TIMEOUT_MS,
  SignalsSchema,
  type Signals,
} from "@agent-town/shared";
import {
  createInMemorySignalCache,
  tickCacheKey,
  type SignalCache,
} from "./cache.js";
import { fetchDexVolume24hUsd, fetchUsdcBorrowApyBps } from "./gateway.js";
import { emptyStaleSignals, SIGNAL_SOURCES } from "./sources.js";

export type FetchExternalSignalsOptions = {
  /** When set, two calls with the same tick reuse one gateway round-trip. */
  tick?: number;
  apiKey?: string;
  cache?: SignalCache;
  /** Override process.env.EXTERNAL_SIGNALS (default on). */
  externalSignalsEnabled?: boolean;
};

let lastKnown: Signals | undefined;
const processCache = createInMemorySignalCache();

function externalSignalsOn(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.EXTERNAL_SIGNALS?.trim().toLowerCase();
  if (!raw) return true;
  return raw === "on";
}

function staleFromLastKnown(fetchedAt: string): Signals {
  if (!lastKnown) return emptyStaleSignals(fetchedAt);
  return SignalsSchema.parse({ ...lastKnown, fetchedAt, stale: true });
}

function buildFreshSignals(
  usdcBorrowApyBps: number,
  dexVolume24hUsd: string,
  fetchedAt: string,
): Signals {
  return SignalsSchema.parse({
    usdcBorrowApyBps,
    dexVolume24hUsd,
    fetchedAt,
    stale: false,
    sources: { ...SIGNAL_SOURCES },
  });
}

async function fetchFromGateway(apiKey: string): Promise<Signals> {
  const signal = AbortSignal.timeout(EXTERNAL_SIGNAL_TIMEOUT_MS);
  const [usdcBorrowApyBps, dexVolume24hUsd] = await Promise.all([
    fetchUsdcBorrowApyBps(apiKey, signal),
    fetchDexVolume24hUsd(apiKey, signal),
  ]);
  return buildFreshSignals(usdcBorrowApyBps, dexVolume24hUsd, new Date().toISOString());
}

/** Drop-in for GET /scoreboard signals (M4.7); safe to call every sim tick. */
export async function fetchExternalSignals(
  options: FetchExternalSignalsOptions = {},
): Promise<Signals> {
  const cache = options.cache ?? processCache;
  const tickKey = tickCacheKey(options.tick);
  const cached = cache.get(tickKey);
  if (cached) return cached;

  const fetchedAt = new Date().toISOString();
  const enabled =
    options.externalSignalsEnabled ?? externalSignalsOn(process.env);

  if (!enabled) {
    const snapshot = staleFromLastKnown(fetchedAt);
    cache.set(tickKey, snapshot);
    return snapshot;
  }

  const apiKey = options.apiKey ?? process.env.GRAPH_API_KEY?.trim();
  if (!apiKey) {
    const snapshot = staleFromLastKnown(fetchedAt);
    cache.set(tickKey, snapshot);
    return snapshot;
  }

  try {
    const fresh = await fetchFromGateway(apiKey);
    lastKnown = fresh;
    cache.set(tickKey, fresh);
    return fresh;
  } catch {
    const snapshot = staleFromLastKnown(fetchedAt);
    cache.set(tickKey, snapshot);
    return snapshot;
  }
}

/** Test-only reset of module cache + last-known snapshot. */
export function resetExternalSignalsForTests(): void {
  lastKnown = undefined;
  processCache.clear();
}

export { createInMemorySignalCache, type SignalCache } from "./cache.js";
export { SIGNAL_SOURCES } from "./sources.js";
