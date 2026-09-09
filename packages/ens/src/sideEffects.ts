// M4.6 ENS side-effects: map repay/default → treasurer writes (score, review, revoke).
// Inputs: loan outcome + current ENS state (or resolveAgent). Outputs: a plan and
// optional simulate/broadcast via the M2.5 client. Never caches tokenIds (R3).
// Default is simulate; send requires `{broadcast:true}` AND `ALLOW_BROADCAST=true`.
import {
  DEFAULT_CREDIT_SCORE,
  EnsReviewSchema,
  type EnsReview,
} from "@agent-town/shared";
import { getAddress, type Account, type Address } from "viem";
import {
  createEnsClient,
  normalizeAgentName,
  type EnsClient,
  type EnsClientConfig,
  type WriteResult,
} from "./client.js";
import { TREASURER_LABEL } from "./records.js";

/** Score bump after a successful repay. Clamped 0–100. Unset score uses DEFAULT_CREDIT_SCORE. */
export const REPAY_SCORE_DELTA = 5 as const;
/** PRD §12: first default drops `town.credit-score` to 35. */
export const FIRST_DEFAULT_SCORE = 35 as const;
/** Reviewer label — treasurer only (`ada`). */
export const CREDIT_REVIEWER = TREASURER_LABEL;

export type OutcomeKind = "repay" | "default";
export type SideEffectAction = "repay" | "first-default" | "second-default" | "skip";

export interface LoanOutcome {
  agent: string;
  kind: OutcomeKind;
  tick: number;
  /** Human-readable USDC amount for the review note (e.g. `"1"`, `"0.3"`), not 6-dec base units. */
  amountUsdc: string;
  loanId?: string | number;
  /** If set, skip counting default reviews on the name (1+ → revoke). */
  priorDefaults?: number;
}

export interface AgentCreditState {
  creditScore?: number;
  reviews?: EnsReview[];
}

export interface SideEffectPlan {
  agent: string;
  ensName: string;
  action: SideEffectAction;
  skipped: boolean;
  reason?: string;
  ledgerKey: string;
  newScore?: number;
  review?: EnsReview;
  revoke: boolean;
}

export interface ApplyLoanOutcomeResult {
  plan: SideEffectPlan;
  writes: WriteResult[];
}

export interface SideEffectClient {
  resolveAgent: EnsClient["resolveAgent"];
  setCreditScore: EnsClient["setCreditScore"];
  appendReview: EnsClient["appendReview"];
  revokeName: EnsClient["revokeName"];
}

export interface ApplyLoanOutcomeConfig extends EnsClientConfig {
  ens?: SideEffectClient;
  /** Expected Sepolia treasurer (TownRegistrar.owner). */
  treasurer?: Address;
  /** Circle/Arc wallets that must never sign ENS writes (workers, merchant, ada SCA). */
  forbiddenSigners?: readonly Address[];
}

const DEFAULT_NOTE_RE = /^\s*defaulted\b/i;
const REPAY_NOTE_RE = /^\s*repaid\b/i;
const LOAN_TAG_RE = /\bloan\s+#?(\S+)/i;

export function clampScore(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Unset `town.credit-score` is treated as DEFAULT_CREDIT_SCORE (70), then +REPAY_SCORE_DELTA. */
export function scoreAfterRepay(current: number | undefined): number {
  return clampScore((current ?? DEFAULT_CREDIT_SCORE) + REPAY_SCORE_DELTA);
}

export function isDefaultReview(review: EnsReview): boolean {
  return DEFAULT_NOTE_RE.test(review.note);
}

export function countDefaultReviews(reviews: readonly EnsReview[] | undefined): number {
  return (reviews ?? []).filter(isDefaultReview).length;
}

export function parseAmountUsdc(raw: string): string {
  const t = raw.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(t)) {
    throw new Error(`amountUsdc must be a human-readable USDC amount, got ${JSON.stringify(raw)}`);
  }
  return t;
}

export function ledgerKey(outcome: Pick<LoanOutcome, "agent" | "kind" | "tick" | "loanId">): string {
  const label = normalizeAgentName(outcome.agent).label;
  const id = outcome.loanId != null ? `loan:${outcome.loanId}` : `tick:${outcome.tick}`;
  return `${label}:${outcome.kind}:${id}`;
}

export function formatOutcomeNote(outcome: Pick<LoanOutcome, "kind" | "amountUsdc" | "tick" | "loanId">): string {
  const amount = parseAmountUsdc(outcome.amountUsdc);
  const base =
    outcome.kind === "default"
      ? `defaulted on ${amount} USDC, tick ${outcome.tick}`
      : `repaid ${amount} USDC, tick ${outcome.tick}`;
  const withLoan = outcome.loanId != null ? `${base}, loan ${outcome.loanId}` : base;
  return withLoan.length <= 200 ? withLoan : withLoan.slice(0, 200);
}

export function reviewMatchesOutcome(review: EnsReview, outcome: LoanOutcome): boolean {
  const prefix = outcome.kind === "default" ? DEFAULT_NOTE_RE : REPAY_NOTE_RE;
  if (!prefix.test(review.note)) return false;
  if (outcome.loanId != null) {
    const id = String(outcome.loanId);
    const tagged = review.note.match(LOAN_TAG_RE);
    if (tagged) return tagged[1] === id || tagged[1] === `#${id}`;
    if (
      review.note.includes(`loan ${id}`) ||
      review.note.includes(`loan #${id}`)
    ) {
      return true;
    }
  }
  return review.tick === outcome.tick;
}

export function alreadyApplied(
  reviews: readonly EnsReview[] | undefined,
  outcome: LoanOutcome,
): boolean {
  return (reviews ?? []).some((r) => reviewMatchesOutcome(r, outcome));
}

export function requireBroadcastGate(broadcast: boolean | undefined): void {
  if (broadcast === true && process.env.ALLOW_BROADCAST !== "true") {
    throw new Error("refusing broadcast: set ALLOW_BROADCAST=true");
  }
}

export function assertTreasurerSigner(
  account: Account | Address,
  opts: { treasurer?: Address; forbidden?: readonly Address[] } = {},
): Address {
  const addr = getAddress(typeof account === "string" ? account : account.address);
  if (opts.forbidden?.some((a) => getAddress(a) === addr)) {
    throw new Error(
      "ENS side-effects must be signed by the treasurer (ENS_TREASURER_PRIVATE_KEY), never a worker wallet",
    );
  }
  if (opts.treasurer && getAddress(opts.treasurer) !== addr) {
    throw new Error(`expected treasurer signer ${getAddress(opts.treasurer)}, got ${addr}`);
  }
  return addr;
}

export function planLoanOutcome(outcome: LoanOutcome, state: AgentCreditState = {}): SideEffectPlan {
  const parsed = parseOutcome(outcome);
  const key = ledgerKey(parsed);
  const reviews = state.reviews ?? [];
  if (alreadyApplied(reviews, parsed)) {
    return skipPlan(parsed, key, "already applied");
  }
  if (parsed.kind === "repay") return planRepay(parsed, state.creditScore, key);
  return planDefault(parsed, reviews, key);
}

export async function applyLoanOutcome(
  outcome: LoanOutcome,
  config: ApplyLoanOutcomeConfig = {},
): Promise<ApplyLoanOutcomeResult> {
  requireBroadcastGate(config.broadcast);
  const account = config.account ?? config.walletClient?.account;
  if (!account) throw new Error("account (or walletClient.account) required for ENS side-effects");
  assertTreasurerSigner(account, { treasurer: config.treasurer, forbidden: config.forbiddenSigners });

  const ens = config.ens ?? createEnsClient(config);
  const parsed = parseOutcome(outcome);
  const resolved = await ens.resolveAgent(parsed.agent);
  const plan = planLoanOutcome(parsed, {
    creditScore: resolved.creditScore,
    reviews: resolved.reviews,
  });
  if (plan.skipped) return { plan, writes: [] };
  return { plan, writes: await execPlan(ens, parsed.agent, plan, config) };
}

function parseOutcome(outcome: LoanOutcome): LoanOutcome & { ensName: string } {
  if (outcome.kind !== "repay" && outcome.kind !== "default") {
    throw new Error(`kind must be repay|default, got ${String(outcome.kind)}`);
  }
  if (!Number.isInteger(outcome.tick) || outcome.tick < 0) {
    throw new Error("tick must be a nonnegative integer");
  }
  if (outcome.priorDefaults != null && (!Number.isInteger(outcome.priorDefaults) || outcome.priorDefaults < 0)) {
    throw new Error("priorDefaults must be a nonnegative integer");
  }
  const n = normalizeAgentName(outcome.agent);
  return { ...outcome, agent: n.label, amountUsdc: parseAmountUsdc(outcome.amountUsdc), ensName: n.ensName };
}

function skipPlan(
  parsed: LoanOutcome & { ensName: string },
  ledgerKeyValue: string,
  reason: string,
): SideEffectPlan {
  return {
    agent: parsed.agent,
    ensName: parsed.ensName,
    action: "skip",
    skipped: true,
    reason,
    ledgerKey: ledgerKeyValue,
    revoke: false,
  };
}

function planRepay(
  parsed: LoanOutcome & { ensName: string },
  current: number | undefined,
  ledgerKeyValue: string,
): SideEffectPlan {
  const newScore = scoreAfterRepay(current);
  return {
    agent: parsed.agent,
    ensName: parsed.ensName,
    action: "repay",
    skipped: false,
    ledgerKey: ledgerKeyValue,
    newScore,
    review: reviewFor(parsed, newScore),
    revoke: false,
  };
}

function planDefault(
  parsed: LoanOutcome & { ensName: string },
  reviews: readonly EnsReview[],
  ledgerKeyValue: string,
): SideEffectPlan {
  const prior = parsed.priorDefaults ?? countDefaultReviews(reviews);
  if (prior >= 1) {
    return {
      agent: parsed.agent,
      ensName: parsed.ensName,
      action: "second-default",
      skipped: false,
      ledgerKey: ledgerKeyValue,
      revoke: true,
    };
  }
  const newScore = FIRST_DEFAULT_SCORE;
  return {
    agent: parsed.agent,
    ensName: parsed.ensName,
    action: "first-default",
    skipped: false,
    ledgerKey: ledgerKeyValue,
    newScore,
    review: reviewFor(parsed, newScore),
    revoke: false,
  };
}

function reviewFor(parsed: LoanOutcome, score: number): EnsReview {
  return EnsReviewSchema.parse({
    by: CREDIT_REVIEWER,
    tick: parsed.tick,
    score,
    note: formatOutcomeNote(parsed),
  });
}

async function execPlan(
  ens: SideEffectClient,
  agent: string,
  plan: SideEffectPlan,
  config: EnsClientConfig,
): Promise<WriteResult[]> {
  const writes: WriteResult[] = [];
  if (plan.revoke) {
    writes.push(await ens.revokeName(agent, config));
    return writes;
  }
  if (plan.newScore != null) {
    writes.push(await ens.setCreditScore(agent, plan.newScore, config));
  }
  if (plan.review) {
    writes.push(await ens.appendReview(agent, plan.review, config));
  }
  return writes;
}
