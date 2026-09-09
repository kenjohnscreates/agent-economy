// Economy rule constants and pure helpers — source: PRD §5 (per-role rules,
// Signal C formulas) and ARCHITECTURE §5.1/§6.2 (timeouts).
// Inputs: none (static) / plain numbers for the helpers. Outputs: `as const`
// literals, `ActionKind` union + zod schema, `computeBaseRateBps`,
// `computeMerchantPrice`. USDC amounts are 6-decimal integer strings, never numbers.
import { z } from "zod";

// ── consumer ────────────────────────────────────────────────────────────────
/** Consumer buys 1 good only if balance > price × CONSUMER_BUY_MULTIPLIER. */
export const CONSUMER_BUY_MULTIPLIER = 2 as const;
/** Treasury pays each consumer a stipend (UBI) every N ticks. */
export const STIPEND_EVERY_TICKS = 3 as const;
/** Stipend amount, 6-dec USDC string (0.5 USDC). */
export const STIPEND_USDC = "500000" as const;

// ── merchant ────────────────────────────────────────────────────────────────
/** Merchant posts a job when inventory drops below this. */
export const MERCHANT_MIN_INVENTORY = 2 as const;
/** Job pay = cost × MERCHANT_JOB_PAY_MULT. */
export const MERCHANT_JOB_PAY_MULT = 1.2 as const;
/** Merchant repays when cash > outstanding loan × MERCHANT_REPAY_MULT. */
export const MERCHANT_REPAY_MULT = 1.5 as const;

// ── worker ──────────────────────────────────────────────────────────────────
/** Worker deposits this % of each job payout into the Treasury. */
export const WORKER_DEPOSIT_PCT = 20 as const;
/** Worker delivers k ticks after accepting a job. */
export const WORKER_DELIVER_TICKS = 1 as const;

// ── treasurer ───────────────────────────────────────────────────────────────
/** Auto-approve loans only when borrower credit score ≥ this; else flag. */
export const TREASURER_MIN_SCORE = 60 as const;
/** Auto-approve only when treasury utilisation < 80%. */
export const TREASURER_MAX_UTILISATION_BPS = 8000 as const;
/** Base rate = real market borrow APY + this spread. */
export const BASE_RATE_SPREAD_BPS = 200 as const;
/** Lower clamp for the base rate (1%). */
export const BASE_RATE_MIN_BPS = 100 as const;
/** Upper clamp for the base rate (20%). Also the mayor slider max. */
export const BASE_RATE_MAX_BPS = 2000 as const;
/** Added on top of base rate after a default is recorded (PRD §12, tick 6–8). */
export const DEFAULT_PREMIUM_BPS = 200 as const;
/**
 * Loan term: a loan approved at tick T is due at T + LOAN_TERM_TICKS.
 * 4 ticks ≈ 1 min at demo cadence; with GRACE_TICKS=2 a loan approved at
 * tick 1 defaults at tick 7 (PRD §12 "default" phase, ticks 6–8).
 */
export const LOAN_TERM_TICKS = 4 as const;
/** Ticks past `dueAtTick` before the treasurer marks a loan defaulted. */
export const GRACE_TICKS = 2 as const;
/** Credit score assigned to a freshly registered agent. */
export const DEFAULT_CREDIT_SCORE = 70 as const;

// ── external signals / LLM ──────────────────────────────────────────────────
/** Merchant price sensitivity to normalised DEX volume (Signal C). */
export const DEX_PRICE_K = 0.5 as const;
/** Advisor/narrator call budget before falling back to rules (ARCH §6.2). */
export const LLM_TIMEOUT_MS = 8000 as const;
/** External subgraph fetch budget before using last-known value + stale=true. */
export const EXTERNAL_SIGNAL_TIMEOUT_MS = 5000 as const;

// ── narration ───────────────────────────────────────────────────────────────
/** Max narration length (agent card + SSE bubble) so bubbles never overflow. */
export const NARRATION_MAX_CHARS = 120 as const;

// ── actions ─────────────────────────────────────────────────────────────────
/** Every action a rule can emit; keyed with (tick, agent, kind) for idempotency. */
export const ACTION_KINDS = [
  "buy",
  "post_job",
  "fund_escrow",
  "accept_job",
  "deliver",
  "complete_job",
  "deposit",
  "withdraw",
  "request_loan",
  "approve_loan",
  "deny_loan",
  "repay",
  "mark_default",
  "set_rate",
  "pay_stipend",
  "set_credit_score",
  "append_review",
  "idle",
] as const;
export const ActionKindSchema = z.enum(ACTION_KINDS);
export type ActionKind = z.infer<typeof ActionKindSchema>;

// ── pure helpers ────────────────────────────────────────────────────────────
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Treasurer base rate anchored to the real USDC borrow APY (PRD §5 Signal C):
 * `clamp(realBorrowApyBps + 200, 100, 2000)`. Result is an integer bps.
 */
export function computeBaseRateBps(realBorrowApyBps: number): number {
  if (!Number.isFinite(realBorrowApyBps)) return BASE_RATE_MIN_BPS;
  return clamp(
    Math.round(realBorrowApyBps) + BASE_RATE_SPREAD_BPS,
    BASE_RATE_MIN_BPS,
    BASE_RATE_MAX_BPS,
  );
}

export interface TownRateInputs {
  marketApyBps: number;
  spreadBps: number;
  defaultPremiumBps: number;
}

/**
 * Town lending rate shown in the Bank panel (PRD §12 "market 4.1% + spread 2%
 * + default premium 2% → 8.1%"):
 * `townRateBps = clamp(marketApyBps + spreadBps, 100, 2000) + defaultPremiumBps`.
 * Utilisation is reported in `RateBreakdown` for display only; it gates
 * approvals (TREASURER_MAX_UTILISATION_BPS) rather than moving the rate.
 */
export function computeTownRateBps({
  marketApyBps,
  spreadBps,
  defaultPremiumBps,
}: TownRateInputs): number {
  const inputs = [marketApyBps, spreadBps, defaultPremiumBps];
  if (!inputs.every(Number.isFinite)) return BASE_RATE_MIN_BPS;
  const base = clamp(Math.round(marketApyBps + spreadBps), BASE_RATE_MIN_BPS, BASE_RATE_MAX_BPS);
  return base + Math.max(0, Math.round(defaultPremiumBps));
}

/**
 * Merchant price reacting to real DEX volume (PRD §5 Signal C):
 * `price = basePrice × (1 + k × normalisedDexVolume)`.
 * `basePrice` is a 6-dec USDC string; `normalisedDexVolume` is 0–1 (clamped).
 * Returns a 6-dec USDC string (floored).
 */
export function computeMerchantPrice(basePrice: string, normalisedDexVolume: number): string {
  const base = BigInt(basePrice);
  const vol = Number.isFinite(normalisedDexVolume) ? clamp(normalisedDexVolume, 0, 1) : 0;
  // Scale multiplier to integer basis points to stay in bigint math.
  const multBps = BigInt(Math.round((1 + DEX_PRICE_K * vol) * 10_000));
  return ((base * multBps) / 10_000n).toString();
}
