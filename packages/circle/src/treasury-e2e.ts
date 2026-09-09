// M1.6 TownTreasury e2e plan: ada registerAgent(bo) → merchant deposit → requestLoan
// → ada approveLoan → repay, then a tiny 1s loan that can markDefault after grace.
// Inputs: on-chain snap (6-dec USDC only). Outputs: ordered idempotent steps.
// Script broadcasts with Circle executeContract + DEFAULT_FEE (never absoluteFee).
import { ensNameFor, type Address } from "@agent-town/shared";
import { TREASURER_NAME, formatUsdc6 } from "./fund.js";
import { type WalletName } from "./roster.js";

/** Merchant who deposits + borrows (ROSTER: bo = merchant). */
export const MERCHANT_NAME = "bo" as const;
export const MERCHANT_ENS_NAME = ensNameFor("bo", "botanica");

/** 0.2 USDC (6-dec). Savings deposit — stays in treasury as totalDeposits. */
export const DEPOSIT_USDC_6 = 200_000n;
/** 0.3 USDC (6-dec). First loan, repaid immediately (interest ≈ 0). */
export const REPAY_LOAN_USDC_6 = 300_000n;
/** 0.2 USDC (6-dec). Second loan, left to default. */
export const DEFAULT_LOAN_USDC_6 = 200_000n;
/** Hard cap per step so this script cannot drain the 3 USDC treasury. */
export const MAX_STEP_USDC_6 = 500_000n;

/** Long enough to repay before due; not used for the default path. */
export const REPAY_TERM_SECONDS = 3600;
/** 1s term so markDefault can follow grace without a multi-minute wait. */
export const DEFAULT_TERM_SECONDS = 1;
/** Deploy default (GRACE_SECONDS); live value is read from the contract. */
export const EXPECTED_GRACE_SECONDS = 120;

export const TREASURY_FNS = {
  registerAgent: "registerAgent(address,string)",
  deposit: "deposit(uint256)",
  requestLoan: "requestLoan(uint256,uint32)",
  approveLoan: "approveLoan(uint256)",
  repay: "repay(uint256,uint256)",
  markDefault: "markDefault(uint256)",
} as const;
export const USDC_APPROVE_FN = "approve(address,uint256)";

export const LOAN_STATUS = {
  None: 0,
  Pending: 1,
  Active: 2,
  Repaid: 3,
  Denied: 4,
  Defaulted: 5,
} as const;

export type LoanPath = "repay" | "default";

export interface TreasuryE2eActor {
  name: WalletName;
  address: Address;
  walletId: string;
}

export interface MerchantSnap extends TreasuryE2eActor {
  usdc6: bigint;
  deposit6: bigint;
  ensName: string;
}

export interface TreasuryLoanSnap {
  id: bigint;
  borrower: Address;
  status: number;
  termSeconds: number;
  dueAt: bigint;
  principal: bigint;
  principalRemaining: bigint;
  interestOwed: bigint;
}

export interface TreasuryE2eSnap {
  treasury: Address;
  treasuryUsdc6: bigint;
  gracePeriodSeconds: number;
  nowSeconds: number;
  loanCount: bigint;
  merchant: MerchantSnap;
  treasurer: TreasuryE2eActor;
  loans: TreasuryLoanSnap[];
}

export type TreasuryE2eStep =
  | {
      kind: "register-agent";
      fromName: typeof TREASURER_NAME;
      fromWalletId: string;
      agent: Address;
      ensName: string;
    }
  | {
      kind: "deposit";
      fromName: typeof MERCHANT_NAME;
      fromWalletId: string;
      treasury: Address;
      amountUsdc6: bigint;
    }
  | {
      kind: "request-loan";
      fromName: typeof MERCHANT_NAME;
      fromWalletId: string;
      amountUsdc6: bigint;
      termSeconds: number;
      path: LoanPath;
      loanId: bigint;
    }
  | {
      kind: "approve-loan";
      fromName: typeof TREASURER_NAME;
      fromWalletId: string;
      loanId: bigint;
      amountUsdc6: bigint;
      path: LoanPath;
    }
  | {
      kind: "repay";
      fromName: typeof MERCHANT_NAME;
      fromWalletId: string;
      treasury: Address;
      loanId: bigint;
      amountUsdc6: bigint;
    }
  | {
      kind: "wait-grace";
      loanId: bigint;
      termSeconds: number;
      gracePeriodSeconds: number;
      waitSeconds: number;
      note: string;
    }
  | {
      kind: "mark-default";
      fromName: typeof TREASURER_NAME;
      fromWalletId: string;
      loanId: bigint;
    }
  | { kind: "skip"; name: string; why: string };

export interface TreasuryE2ePlan {
  steps: TreasuryE2eStep[];
  repayLoanId: bigint;
  defaultLoanId: bigint;
  gracePeriodSeconds: number;
  graceNote: string;
}

export function isRepayLoan(l: TreasuryLoanSnap): boolean {
  return l.principal === REPAY_LOAN_USDC_6 && l.termSeconds === REPAY_TERM_SECONDS;
}

export function isDefaultLoan(l: TreasuryLoanSnap): boolean {
  return l.principal === DEFAULT_LOAN_USDC_6 && l.termSeconds === DEFAULT_TERM_SECONDS;
}

/** Seconds to sleep so `block.timestamp > dueAt + grace` (contract uses `<=`). */
export function secondsUntilDefaultable(
  dueAt: bigint,
  gracePeriodSeconds: number,
  nowSeconds: number,
): number {
  const target = Number(dueAt) + gracePeriodSeconds + 1;
  return Math.max(0, target - nowSeconds);
}

export function plannedDefaultWaitSeconds(termSeconds: number, gracePeriodSeconds: number): number {
  return termSeconds + gracePeriodSeconds + 1;
}

export function graceNote(gracePeriodSeconds: number): string {
  const wait = plannedDefaultWaitSeconds(DEFAULT_TERM_SECONDS, gracePeriodSeconds);
  if (gracePeriodSeconds === EXPECTED_GRACE_SECONDS) {
    return `gracePeriodSeconds=${gracePeriodSeconds} (deploy default). Short loan term=${DEFAULT_TERM_SECONDS}s → --yes waits ≈ ${wait}s after approve, then markDefault.`;
  }
  return `gracePeriodSeconds=${gracePeriodSeconds}. Short loan term=${DEFAULT_TERM_SECONDS}s → --yes waits ≈ ${wait}s after approve, then markDefault.`;
}

function requireWalletId(actor: TreasuryE2eActor): void {
  if (!actor.walletId) {
    throw new Error(`${actor.name} has no Circle walletId — run setup-wallets`);
  }
}

function requireSafeAmount(amount: bigint, label: string): void {
  if (amount <= 0n) throw new Error(`${label}: amount must be > 0`);
  if (amount > MAX_STEP_USDC_6) {
    throw new Error(`${label}: ${amount} exceeds cap ${MAX_STEP_USDC_6} (0.5 USDC)`);
  }
}

function assertNoForeignActive(loans: TreasuryLoanSnap[]): void {
  const foreign = loans.find(
    (l) =>
      (l.status === LOAN_STATUS.Pending || l.status === LOAN_STATUS.Active) &&
      !isRepayLoan(l) &&
      !isDefaultLoan(l),
  );
  if (foreign) {
    throw new Error(
      `merchant has unrelated loan ${foreign.id.toString()} status=${foreign.status} principal=${foreign.principal.toString()} — refuse to mix flows`,
    );
  }
}

function assertTerminalOk(loan: TreasuryLoanSnap, path: LoanPath): void {
  if (loan.status === LOAN_STATUS.Denied) {
    throw new Error(`${path}-path loan ${loan.id.toString()} is Denied`);
  }
}

function assertLiquidity(steps: TreasuryE2eStep[], startBal: bigint): void {
  let bal = startBal;
  for (const s of steps) {
    if (s.kind === "deposit") bal += s.amountUsdc6;
    if (s.kind === "approve-loan") {
      if (s.amountUsdc6 > bal) {
        throw new Error(
          `InsufficientLiquidity: approve ${s.path} loan ${s.loanId.toString()} needs ${s.amountUsdc6.toString()} have ${bal.toString()}`,
        );
      }
      bal -= s.amountUsdc6;
    }
    if (s.kind === "repay") bal += s.amountUsdc6;
  }
}

function nextLoanIds(snap: TreasuryE2eSnap): { repayLoanId: bigint; defaultLoanId: bigint } {
  const repayLoan = snap.loans.find(isRepayLoan);
  const defaultLoan = snap.loans.find(isDefaultLoan);
  let nextId = snap.loanCount + 1n;
  const repayLoanId = repayLoan?.id ?? nextId;
  if (!repayLoan) nextId += 1n;
  const defaultLoanId = defaultLoan?.id ?? nextId;
  return { repayLoanId, defaultLoanId };
}

function repayOwed(loan: TreasuryLoanSnap): bigint {
  const owed = loan.principalRemaining + loan.interestOwed;
  return owed > 0n ? owed : loan.principal;
}

function pushRegister(steps: TreasuryE2eStep[], snap: TreasuryE2eSnap): void {
  if (snap.merchant.ensName === MERCHANT_ENS_NAME) {
    steps.push({ kind: "skip", name: "register-agent", why: `already ${MERCHANT_ENS_NAME}` });
    return;
  }
  steps.push({
    kind: "register-agent",
    fromName: TREASURER_NAME,
    fromWalletId: snap.treasurer.walletId,
    agent: snap.merchant.address,
    ensName: MERCHANT_ENS_NAME,
  });
}

function pushDeposit(steps: TreasuryE2eStep[], snap: TreasuryE2eSnap): void {
  if (snap.merchant.deposit6 >= DEPOSIT_USDC_6) {
    steps.push({
      kind: "skip",
      name: "deposit",
      why: `already ${formatUsdc6(snap.merchant.deposit6)}`,
    });
    return;
  }
  requireSafeAmount(DEPOSIT_USDC_6, "deposit");
  steps.push({
    kind: "deposit",
    fromName: MERCHANT_NAME,
    fromWalletId: snap.merchant.walletId,
    treasury: snap.treasury,
    amountUsdc6: DEPOSIT_USDC_6,
  });
}

function pushRepayPath(
  steps: TreasuryE2eStep[],
  snap: TreasuryE2eSnap,
  loan: TreasuryLoanSnap | undefined,
  loanId: bigint,
): void {
  if (loan) assertTerminalOk(loan, "repay");
  if (loan?.status === LOAN_STATUS.Defaulted) {
    throw new Error(`repay-path loan ${loan.id.toString()} is Defaulted`);
  }
  if (loan?.status === LOAN_STATUS.Repaid) {
    steps.push({
      kind: "skip",
      name: "request-loan/repay",
      why: `loan ${loanId.toString()} repaid`,
    });
    steps.push({
      kind: "skip",
      name: "approve-loan/repay",
      why: `loan ${loanId.toString()} repaid`,
    });
    steps.push({ kind: "skip", name: "repay", why: `loan ${loanId.toString()} repaid` });
    return;
  }

  if (!loan) {
    requireSafeAmount(REPAY_LOAN_USDC_6, "repay-loan");
    steps.push({
      kind: "request-loan",
      fromName: MERCHANT_NAME,
      fromWalletId: snap.merchant.walletId,
      amountUsdc6: REPAY_LOAN_USDC_6,
      termSeconds: REPAY_TERM_SECONDS,
      path: "repay",
      loanId,
    });
  } else {
    steps.push({
      kind: "skip",
      name: "request-loan/repay",
      why: `loan ${loanId.toString()} already requested`,
    });
  }

  if (!loan || loan.status === LOAN_STATUS.Pending) {
    steps.push({
      kind: "approve-loan",
      fromName: TREASURER_NAME,
      fromWalletId: snap.treasurer.walletId,
      loanId,
      amountUsdc6: loan?.principal ?? REPAY_LOAN_USDC_6,
      path: "repay",
    });
  } else {
    steps.push({
      kind: "skip",
      name: "approve-loan/repay",
      why: `loan ${loanId.toString()} status=${loan.status}`,
    });
  }

  steps.push({
    kind: "repay",
    fromName: MERCHANT_NAME,
    fromWalletId: snap.merchant.walletId,
    treasury: snap.treasury,
    loanId,
    amountUsdc6: loan ? repayOwed(loan) : REPAY_LOAN_USDC_6,
  });
}

function waitStep(
  snap: TreasuryE2eSnap,
  loan: TreasuryLoanSnap | undefined,
  loanId: bigint,
): Extract<TreasuryE2eStep, { kind: "wait-grace" }> {
  const waitSeconds =
    loan?.status === LOAN_STATUS.Active && loan.dueAt > 0n
      ? secondsUntilDefaultable(loan.dueAt, snap.gracePeriodSeconds, snap.nowSeconds)
      : plannedDefaultWaitSeconds(DEFAULT_TERM_SECONDS, snap.gracePeriodSeconds);
  return {
    kind: "wait-grace",
    loanId,
    termSeconds: loan?.termSeconds ?? DEFAULT_TERM_SECONDS,
    gracePeriodSeconds: snap.gracePeriodSeconds,
    waitSeconds,
    note: graceNote(snap.gracePeriodSeconds),
  };
}

function pushDefaultPath(
  steps: TreasuryE2eStep[],
  snap: TreasuryE2eSnap,
  loan: TreasuryLoanSnap | undefined,
  loanId: bigint,
): void {
  if (loan) assertTerminalOk(loan, "default");
  if (loan?.status === LOAN_STATUS.Defaulted) {
    steps.push({
      kind: "skip",
      name: "request-loan/default",
      why: `loan ${loanId.toString()} defaulted`,
    });
    steps.push({
      kind: "skip",
      name: "approve-loan/default",
      why: `loan ${loanId.toString()} defaulted`,
    });
    steps.push({ kind: "skip", name: "wait-grace", why: `loan ${loanId.toString()} defaulted` });
    steps.push({ kind: "skip", name: "mark-default", why: `loan ${loanId.toString()} defaulted` });
    return;
  }
  if (loan?.status === LOAN_STATUS.Repaid) {
    steps.push({
      kind: "skip",
      name: "mark-default",
      why: `loan ${loanId.toString()} repaid — nothing to default`,
    });
    return;
  }

  if (!loan) {
    requireSafeAmount(DEFAULT_LOAN_USDC_6, "default-loan");
    steps.push({
      kind: "request-loan",
      fromName: MERCHANT_NAME,
      fromWalletId: snap.merchant.walletId,
      amountUsdc6: DEFAULT_LOAN_USDC_6,
      termSeconds: DEFAULT_TERM_SECONDS,
      path: "default",
      loanId,
    });
  } else {
    steps.push({
      kind: "skip",
      name: "request-loan/default",
      why: `loan ${loanId.toString()} already requested`,
    });
  }

  if (!loan || loan.status === LOAN_STATUS.Pending) {
    steps.push({
      kind: "approve-loan",
      fromName: TREASURER_NAME,
      fromWalletId: snap.treasurer.walletId,
      loanId,
      amountUsdc6: loan?.principal ?? DEFAULT_LOAN_USDC_6,
      path: "default",
    });
  } else {
    steps.push({
      kind: "skip",
      name: "approve-loan/default",
      why: `loan ${loanId.toString()} status=${loan.status}`,
    });
  }

  steps.push(waitStep(snap, loan, loanId));
  steps.push({
    kind: "mark-default",
    fromName: TREASURER_NAME,
    fromWalletId: snap.treasurer.walletId,
    loanId,
  });
}

export function buildTreasuryE2ePlan(snap: TreasuryE2eSnap): TreasuryE2ePlan {
  requireWalletId(snap.treasurer);
  requireWalletId(snap.merchant);
  if (snap.treasurer.name !== TREASURER_NAME) {
    throw new Error(`treasurer must be ${TREASURER_NAME}, got ${snap.treasurer.name}`);
  }
  if (snap.merchant.name !== MERCHANT_NAME) {
    throw new Error(`merchant must be ${MERCHANT_NAME}, got ${snap.merchant.name}`);
  }
  assertNoForeignActive(snap.loans);

  const { repayLoanId, defaultLoanId } = nextLoanIds(snap);
  const repayLoan = snap.loans.find(isRepayLoan);
  const defaultLoan = snap.loans.find(isDefaultLoan);
  const steps: TreasuryE2eStep[] = [];

  pushRegister(steps, snap);
  pushDeposit(steps, snap);
  pushRepayPath(steps, snap, repayLoan, repayLoanId);
  pushDefaultPath(steps, snap, defaultLoan, defaultLoanId);
  assertLiquidity(steps, snap.treasuryUsdc6);

  return {
    steps,
    repayLoanId,
    defaultLoanId,
    gracePeriodSeconds: snap.gracePeriodSeconds,
    graceNote: graceNote(snap.gracePeriodSeconds),
  };
}

export function formatTreasuryE2eStep(step: TreasuryE2eStep): string {
  switch (step.kind) {
    case "register-agent":
      return `register-agent  ${step.fromName} → ${step.agent}  ${step.ensName}`;
    case "deposit":
      return `deposit         ${step.fromName.padEnd(7)} approve+deposit ${formatUsdc6(step.amountUsdc6)}`;
    case "request-loan":
      return `request-loan    ${step.fromName.padEnd(7)} loan ${step.loanId.toString()}  ${formatUsdc6(step.amountUsdc6)}  term=${step.termSeconds}s  (${step.path})`;
    case "approve-loan":
      return `approve-loan    ${step.fromName.padEnd(7)} loan ${step.loanId.toString()}  ${formatUsdc6(step.amountUsdc6)}  (${step.path})`;
    case "repay":
      return `repay           ${step.fromName.padEnd(7)} loan ${step.loanId.toString()}  approve+repay ${formatUsdc6(step.amountUsdc6)}`;
    case "wait-grace":
      return `wait-grace      loan ${step.loanId.toString()}  term=${step.termSeconds}s  grace=${step.gracePeriodSeconds}s  wait ≈ ${step.waitSeconds}s  then markDefault`;
    case "mark-default":
      return `mark-default    ${step.fromName.padEnd(7)} loan ${step.loanId.toString()}`;
    case "skip":
      return `skip            ${step.name.padEnd(22)} ${step.why}`;
  }
}
