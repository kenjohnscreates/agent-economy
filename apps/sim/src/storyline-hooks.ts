// Storyline scheduler — demo script keyed by tick number (ARCHITECTURE §6.1).
// `prepare` patches WorldState before decide(); `finalize` injects scripted actions
// when rules did not already emit them. `STORYLINE=free` → log only.
// M4.6: repay/default ENS stays dry-run unless execute + Gate A (--yes).
import {
  BASE_RATE_SPREAD_BPS,
  DEFAULT_PREMIUM_BPS,
  computeTownRateBps,
  type AgentName,
  type StorylineMode,
  type StorylinePhase,
} from "@agent-town/shared";
import type { ProposedAction } from "./decide.js";
import type { Ledger } from "./ledger/index.js";
import { loadWorld, type WorldLoan, type WorldState } from "./world.js";

export interface StorylineForcedAction {
  agent: AgentName;
  action: ProposedAction;
}

export interface OnTickContext {
  mode: StorylineMode;
  stage: "prepare" | "finalize";
  world: WorldState;
  ledger: Ledger;
  /** Live Circle execute — skip fixture loan/job overlays and ids. Default dry-run. */
  executeEnabled: boolean;
}

export interface OnTickResult {
  world: WorldState;
  forcedActions: StorylineForcedAction[];
}

const DEMO_FAY_LOAN_ID = "L-2";
const DEMO_BO_LOAN_ID = "L-1";
const DEMO_FLAG_LOAN_ID = "L-flag";
const DEMO_JOB_ID = "J-demo";

const DEMO_JOB = {
  id: DEMO_JOB_ID,
  client: "bo",
  provider: "dee",
  amountUsdc: "1200000",
  status: "open",
} as const;

const DEMO_FLAG_LOAN: WorldLoan = {
  id: DEMO_FLAG_LOAN_ID,
  borrower: "eli",
  principalUsdc: "1000000",
  status: "pending",
  approvedAtTick: null,
};

const DEMO_FAY_APPROVED: WorldLoan = {
  id: DEMO_FAY_LOAN_ID,
  borrower: "fay",
  principalUsdc: "1000000",
  status: "approved",
  approvedAtTick: 1,
};

const DEMO_FAY_DEFAULTED: WorldLoan = {
  id: DEMO_FAY_LOAN_ID,
  borrower: "fay",
  principalUsdc: "1000000",
  status: "defaulted",
  approvedAtTick: 1,
};

const DEMO_BO_LOAN: WorldLoan = {
  id: DEMO_BO_LOAN_ID,
  borrower: "bo",
  principalUsdc: "3000000",
  status: "approved",
  approvedAtTick: 4,
};

function mergeLoan(loans: WorldLoan[], loan: WorldLoan): WorldLoan[] {
  const rest = loans.filter((l) => l.id !== loan.id);
  return [...rest, loan];
}

function withoutApprovedBoLoan(loans: WorldLoan[]): WorldLoan[] {
  return loans.filter((l) => !(l.id === DEMO_BO_LOAN_ID && l.status === "approved"));
}

/** On-chain ids are pure digits; fixtures like `L-1` / `J-demo` are not. */
function isNumericId(id: string): boolean {
  return /^\d+$/.test(id);
}

function isActiveLoan(loan: WorldLoan): boolean {
  return loan.status === "approved";
}

/** Live t7: first Active numeric loan whose borrower is not bo; prefer cy. */
function liveMarkDefaultTarget(world: WorldState): WorldLoan | undefined {
  const candidates = world.loans.filter(
    (l) => isNumericId(l.id) && isActiveLoan(l) && l.borrower !== "bo",
  );
  return candidates.find((l) => l.borrower === "cy") ?? candidates[0];
}

/** Live t9: bo's Active numeric loan. */
function liveBoRepayTarget(world: WorldState): WorldLoan | undefined {
  return world.loans.find((l) => isNumericId(l.id) && isActiveLoan(l) && l.borrower === "bo");
}

/** Match `maybeRate` so demo ticks skip set_rate unless the world rate is behind. */
function alignedBaseRateBps(world: WorldState): number {
  return computeTownRateBps({
    marketApyBps: world.signals.usdcBorrowApyBps,
    spreadBps: BASE_RATE_SPREAD_BPS,
    defaultPremiumBps: world.treasury.defaults > 0 ? DEFAULT_PREMIUM_BPS : 0,
  });
}

async function ledgerHasKindEver(
  ledger: Ledger,
  agent: AgentName,
  kind: ProposedAction["kind"],
): Promise<boolean> {
  const actions = await ledger.listActions();
  return actions.some((a) => a.agent === agent && a.kind === kind);
}

/** Demo world overlays so PRD §12 plays from fixtures without live subgraph state. */
export function patchDemoWorld(
  world: WorldState,
  tick: number,
  phase: StorylinePhase,
  executeEnabled = false,
): WorldState {
  let w = loadWorld(tick, {
    ...world,
    creditScores: {
      ...world.creditScores,
      fay: tick >= 8 ? 35 : 70,
      bo: 78,
      ...(tick >= 9 && tick <= 10 ? { eli: 50 } : {}),
    },
    signals: {
      ...world.signals,
      usdcBorrowApyBps: world.signals.usdcBorrowApyBps || 410,
      dexVolume24hUsd: world.signals.dexVolume24hUsd === "0" ? "184532211" : world.signals.dexVolume24hUsd,
      stale: world.signals.stale,
    },
    merchantPriceUsdc: world.merchantPriceUsdc === "0" ? "500000" : world.merchantPriceUsdc,
    restockCostUsdc: world.restockCostUsdc === "0" ? "1000000" : world.restockCostUsdc,
  });

  if (!executeEnabled) {
    const fayLoan = tick >= 8 ? DEMO_FAY_DEFAULTED : DEMO_FAY_APPROVED;
    w = loadWorld(tick, { ...w, loans: mergeLoan(w.loans, fayLoan) });
  }

  if (phase === "boom" || tick <= 3) {
    w = loadWorld(tick, {
      ...w,
      balances: {
        ...w.balances,
        gus: "5000000",
        hal: "5000000",
        bo: "500000",
        cy: "800000",
      },
      inventory: { ...w.inventory, bo: 1, cy: 1 },
    });
    if (!executeEnabled) {
      const demoJob = {
        ...DEMO_JOB,
        status: tick >= 3 ? "submitted" : tick >= 2 ? "funded" : "open",
      };
      w = loadWorld(tick, {
        ...w,
        jobs: [...w.jobs.filter((j) => j.id !== DEMO_JOB_ID), demoJob],
        settledPayouts: tick >= 3 ? { ...w.settledPayouts, dee: DEMO_JOB.amountUsdc } : w.settledPayouts,
        assignments:
          tick >= 2
            ? [
                ...w.assignments.filter((a) => a.jobId !== DEMO_JOB_ID),
                { jobId: DEMO_JOB_ID, worker: "dee", acceptedAtTick: tick - 1 },
              ]
            : w.assignments.filter((a) => a.jobId !== DEMO_JOB_ID),
      });
    }
  }

  if (tick === 4) {
    w = loadWorld(tick, {
      ...w,
      inventory: { ...w.inventory, bo: 1 },
      balances: { ...w.balances, bo: "100000" },
      loans: executeEnabled
        ? w.loans
        : w.loans.filter((l) => !(l.borrower === "bo" && l.status === "pending")),
    });
  }

  if (tick >= 5 && tick <= 8) {
    w = loadWorld(tick, {
      ...w,
      loans: executeEnabled ? w.loans : mergeLoan(w.loans, DEMO_BO_LOAN),
      treasury: {
        ...w.treasury,
        utilisationBps: 2200,
        outstandingUsdc: "3000000",
        defaults: 0,
      },
    });
  }

  if (tick === 9) {
    w = loadWorld(tick, {
      ...w,
      loans: executeEnabled ? w.loans : mergeLoan(w.loans, DEMO_BO_LOAN),
      balances: { ...w.balances, bo: "5000000" },
      treasury: {
        ...w.treasury,
        utilisationBps: 2500,
        outstandingUsdc: "4000000",
        defaults: 1,
        baseRateBps: 610,
      },
    });
  }

  if (tick >= 7 && tick <= 9) {
    w = loadWorld(tick, {
      ...w,
      treasury: {
        ...w.treasury,
        utilisationBps: 2500,
        outstandingUsdc: "4000000",
        defaults: 1,
        baseRateBps: 610,
      },
    });
  }

  if (phase === "hike" || tick >= 9) {
    w = loadWorld(tick, {
      ...w,
      treasury: {
        ...w.treasury,
        utilisationBps: w.treasury.utilisationBps || 2500,
        outstandingUsdc: w.treasury.outstandingUsdc === "0" ? "4000000" : w.treasury.outstandingUsdc,
        defaults: Math.max(w.treasury.defaults, 1),
        baseRateBps: tick >= 10 ? 810 : 610,
      },
    });
  }

  if (tick >= 10) {
    w = loadWorld(tick, {
      ...w,
      loans: executeEnabled ? w.loans : withoutApprovedBoLoan(w.loans),
      balances: { ...w.balances, bo: "5000000" },
      treasury: {
        ...w.treasury,
        defaults: 1,
        outstandingUsdc: "1000000",
        baseRateBps: 810,
      },
    });
  }

  if (tick === 9 || tick === 10) {
    w = loadWorld(tick, {
      ...w,
      creditScores: { ...w.creditScores, eli: 50 },
      loans: executeEnabled ? w.loans : mergeLoan(w.loans, DEMO_FLAG_LOAN),
    });
  }

  const computedRate = alignedBaseRateBps(w);
  w = loadWorld(tick, {
    ...w,
    treasury: {
      ...w.treasury,
      // Hike tick: keep world rate behind computed so maybeRate emits set_rate; then catch up.
      baseRateBps: tick === 9 ? computedRate - DEFAULT_PREMIUM_BPS : computedRate,
    },
  });

  return w;
}

async function ledgerHasKind(
  ledger: Ledger,
  tick: number,
  agent: AgentName,
  kind: ProposedAction["kind"],
): Promise<boolean> {
  return (await ledger.findAction(tick, agent, kind)) !== undefined;
}

async function demoForcedActions(
  tick: number,
  phase: StorylinePhase,
  world: WorldState,
  ledger: Ledger,
  executeEnabled = false,
): Promise<StorylineForcedAction[]> {
  const forced: StorylineForcedAction[] = [];

  if (tick === 4) {
    const pending = world.loans.some((l) => l.borrower === "bo" && l.status === "pending");
    if (!pending && !(await ledgerHasKind(ledger, tick, "bo", "request_loan"))) {
      forced.push({
        agent: "bo",
        action: { kind: "request_loan", amountUsdc: "1200000" },
      });
    }
  }

  if (tick === 7 && phase === "default") {
    if (!(await ledgerHasKindEver(ledger, "ada", "mark_default"))) {
      if (executeEnabled) {
        const loan = liveMarkDefaultTarget(world);
        if (loan) {
          forced.push({
            agent: "ada",
            action: { kind: "mark_default", loanId: loan.id, amountUsdc: loan.principalUsdc },
          });
        }
      } else {
        forced.push({
          agent: "ada",
          action: {
            kind: "mark_default",
            loanId: DEMO_FAY_LOAN_ID,
            amountUsdc: DEMO_FAY_APPROVED.principalUsdc,
          },
        });
      }
    }
  }

  if (tick === 9 && phase === "hike") {
    if (!(await ledgerHasKind(ledger, tick, "ada", "set_rate"))) {
      const bps = computeTownRateBps({
        marketApyBps: world.signals.usdcBorrowApyBps,
        spreadBps: BASE_RATE_SPREAD_BPS,
        defaultPremiumBps: DEFAULT_PREMIUM_BPS,
      });
      forced.push({ agent: "ada", action: { kind: "set_rate", bps } });
    }
  }

  if (tick === 9) {
    if (!(await ledgerHasKindEver(ledger, "bo", "repay"))) {
      if (executeEnabled) {
        const loan = liveBoRepayTarget(world);
        if (loan) {
          forced.push({
            agent: "bo",
            action: { kind: "repay", loanId: loan.id, amountUsdc: loan.principalUsdc },
          });
        }
      } else {
        forced.push({
          agent: "bo",
          action: {
            kind: "repay",
            loanId: DEMO_BO_LOAN_ID,
            amountUsdc: DEMO_BO_LOAN.principalUsdc,
          },
        });
      }
    }
  }

  return forced;
}

/**
 * Storyline hook — `prepare` patches world before decide; `finalize` returns
 * scripted actions to persist when rules did not already emit them.
 */
export async function onTick(
  tick: number,
  phase: StorylinePhase,
  ctx: OnTickContext,
): Promise<OnTickResult> {
  if (ctx.mode === "free") {
    console.log(`[sim] storyline hook tick=${tick} phase=${phase} mode=free`);
    return { world: ctx.world, forcedActions: [] };
  }

  if (ctx.stage === "prepare") {
    const world = patchDemoWorld(ctx.world, tick, phase, ctx.executeEnabled);
    console.log(`[sim] storyline prepare tick=${tick} phase=${phase}`);
    return { world, forcedActions: [] };
  }

  const forcedActions = await demoForcedActions(
    tick,
    phase,
    ctx.world,
    ctx.ledger,
    ctx.executeEnabled,
  );
  console.log(`[sim] storyline finalize tick=${tick} phase=${phase} forced=${forcedActions.length}`);
  return { world: ctx.world, forcedActions };
}
