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
}

export interface OnTickResult {
  world: WorldState;
  forcedActions: StorylineForcedAction[];
}

const DEMO_FAY_LOAN_ID = "L-2";
const DEMO_BO_LOAN_ID = "L-1";

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

async function ledgerHasKindEver(
  ledger: Ledger,
  agent: AgentName,
  kind: ProposedAction["kind"],
): Promise<boolean> {
  const actions = await ledger.listActions();
  return actions.some((a) => a.agent === agent && a.kind === kind);
}

/** Demo world overlays so PRD §12 plays from fixtures without live subgraph state. */
export function patchDemoWorld(world: WorldState, tick: number, phase: StorylinePhase): WorldState {
  let w = loadWorld(tick, {
    ...world,
    creditScores: {
      fay: tick >= 8 ? 35 : 70,
      bo: 78,
      ...world.creditScores,
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

  const fayLoan = tick >= 8 ? DEMO_FAY_DEFAULTED : DEMO_FAY_APPROVED;
  w = loadWorld(tick, { ...w, loans: mergeLoan(w.loans, fayLoan) });

  if (phase === "boom" || tick <= 3) {
    w = loadWorld(tick, {
      ...w,
      balances: {
        gus: "5000000",
        hal: "5000000",
        bo: "500000",
        cy: "800000",
        ...w.balances,
      },
      inventory: { bo: 1, cy: 1, ...w.inventory },
    });
  }

  if (tick === 4) {
    w = loadWorld(tick, {
      ...w,
      inventory: { ...w.inventory, bo: 1 },
      balances: { ...w.balances, bo: "100000" },
      loans: w.loans.filter((l) => !(l.borrower === "bo" && l.status === "pending")),
    });
  }

  if (tick >= 5 && tick <= 8) {
    w = loadWorld(tick, {
      ...w,
      loans: mergeLoan(w.loans, DEMO_BO_LOAN),
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
      loans: mergeLoan(w.loans, DEMO_BO_LOAN),
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
      loans: withoutApprovedBoLoan(w.loans),
      balances: { ...w.balances, bo: "5000000" },
      treasury: {
        ...w.treasury,
        defaults: 1,
        outstandingUsdc: "1000000",
        baseRateBps: 810,
      },
    });
  }

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
    const world = patchDemoWorld(ctx.world, tick, phase);
    console.log(`[sim] storyline prepare tick=${tick} phase=${phase}`);
    return { world, forcedActions: [] };
  }

  const forcedActions = await demoForcedActions(tick, phase, ctx.world, ctx.ledger);
  console.log(`[sim] storyline finalize tick=${tick} phase=${phase} forced=${forcedActions.length}`);
  return { world: ctx.world, forcedActions };
}
