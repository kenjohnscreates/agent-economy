// World snapshot for decide() — balances/jobs/loans/signals, no network.
// USDC is 6-dec integer strings; math is BigInt only. Empty world → all idle.
// DEX volume → [0,1] via clamp(volume / DEX_VOLUME_NORM_USD, 0, 1) (Signal C).
import {
  AGENT_NAMES,
  computeBaseRateBps,
  computeMerchantPrice,
  type AgentName,
} from "@agent-town/shared";

/** USD volume divisor for Signal C merchant price (1e8). Do not change DEX_PRICE_K. */
export const DEX_VOLUME_NORM_USD = 100_000_000 as const;

export interface WorldJob {
  id: string;
  client: string;
  provider: string;
  amountUsdc: string;
  status: string;
}

export interface WorldLoan {
  id: string;
  borrower: string;
  principalUsdc: string;
  status: string;
  approvedAtTick: number | null;
}

export interface WorldAssignment {
  jobId: string;
  worker: AgentName;
  acceptedAtTick: number;
}

export interface WorldSignals {
  usdcBorrowApyBps: number;
  dexVolume24hUsd: string;
  stale: boolean;
}

export interface WorldTreasury {
  utilisationBps: number;
  outstandingUsdc: string;
  baseRateBps: number;
  defaults: number;
}

export interface WorldState {
  tick: number;
  balances: Partial<Record<AgentName, string>>;
  inventory: Partial<Record<AgentName, number>>;
  jobs: WorldJob[];
  loans: WorldLoan[];
  treasury: WorldTreasury;
  signals: WorldSignals;
  merchantPriceUsdc: string;
  restockCostUsdc: string;
  assignments: WorldAssignment[];
  creditScores: Partial<Record<AgentName, number>>;
  settledPayouts: Partial<Record<AgentName, string>>;
}

const USDC_INT = /^\d+$/;

/** Parse a 6-dec USDC string; invalid/missing → 0n. Never Number(). */
export function usdcBigint(value: string | undefined): bigint {
  if (!value || !USDC_INT.test(value)) return 0n;
  return BigInt(value);
}

/** `amount * num / den` in 6-dec USDC integer space (floored). */
export function mulUsdcRatio(amount: string, num: bigint, den: bigint): string {
  return ((usdcBigint(amount) * num) / den).toString();
}

/** Signal C: clamp(parse(volume) / 1e8, 0, 1). Non-finite → 0. */
export function normaliseDexVolume(dexVolume24hUsd: string): number {
  const n = Number(dexVolume24hUsd);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1, n / DEX_VOLUME_NORM_USD);
}

/** Merchant unit price from base + raw DEX USD volume (uses last-known volume when stale). */
export function priceFromSignals(basePriceUsdc: string, dexVolume24hUsd: string): string {
  return computeMerchantPrice(basePriceUsdc, normaliseDexVolume(dexVolume24hUsd));
}

export function isRosterAgent(name: string): name is AgentName {
  return (AGENT_NAMES as readonly string[]).includes(name);
}

/** Safe default: no cash, stocked merchants, matching rate, no jobs/loans → idle. */
export function emptyWorld(tick: number): WorldState {
  return {
    tick,
    balances: {},
    inventory: {},
    jobs: [],
    loans: [],
    treasury: {
      utilisationBps: 0,
      outstandingUsdc: "0",
      baseRateBps: computeBaseRateBps(0),
      defaults: 0,
    },
    signals: { usdcBorrowApyBps: 0, dexVolume24hUsd: "0", stale: false },
    merchantPriceUsdc: "0",
    restockCostUsdc: "0",
    assignments: [],
    creditScores: {},
    settledPayouts: {},
  };
}

/**
 * Map a pre-fetched snapshot → WorldState. No network (M4.3 / tests call this).
 * Caller supplies subgraph DTOs already filtered to the town roster.
 */
export function loadWorld(tick: number, input: Partial<Omit<WorldState, "tick">> = {}): WorldState {
  return { ...emptyWorld(tick), ...input, tick };
}
