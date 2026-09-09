// Role rules (PRD §5) — pure decide(agent, ctx.world) → ProposedAction[].
// Deterministic: no network, no Date, no LLM. Circle txs are M4.3.
// Stipend: tick % STIPEND_EVERY_TICKS === 0 (3, 6, 9, …); treasurer emits it.
// Flag to mayor = no approve_loan / deny_loan (loan stays pending). No new ActionKind.
import {
  ActionKindSchema,
  AGENT_NAMES,
  BASE_RATE_SPREAD_BPS,
  CONSUMER_BUY_MULTIPLIER,
  DEFAULT_PREMIUM_BPS,
  GRACE_TICKS,
  LOAN_TERM_TICKS,
  MERCHANT_MIN_INVENTORY,
  ROSTER,
  STIPEND_EVERY_TICKS,
  STIPEND_USDC,
  TREASURER_MAX_UTILISATION_BPS,
  TREASURER_MIN_SCORE,
  UsdcSchema,
  WORKER_DELIVER_TICKS,
  WORKER_DEPOSIT_PCT,
  computeTownRateBps,
  type ActionKind,
  type AgentName,
  type RosterEntry,
  type StorylinePhase,
} from "@agent-town/shared";
import { z } from "zod";
import { isRosterAgent, mulUsdcRatio, usdcBigint, type WorldState } from "./world.js";

export interface TickContext {
  tick: number;
  phase: StorylinePhase;
  world: WorldState;
}

export const ProposedActionSchema = z.object({
  kind: ActionKindSchema,
  loanId: z.string().min(1).optional(),
  amountUsdc: UsdcSchema.optional(),
  jobId: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  bps: z.int().nonnegative().optional(),
});
export type ProposedAction = z.infer<typeof ProposedActionSchema>;

const IDLE: ProposedAction[] = [{ kind: "idle" }];

function orIdle(actions: ProposedAction[]): ProposedAction[] {
  return actions.length === 0 ? IDLE : actions;
}

function withTick(ctx: TickContext): WorldState {
  return { ...ctx.world, tick: ctx.tick };
}

/** PRD §5 rules for one roster agent against a fixture or injected WorldState. */
export function decide(agent: RosterEntry, ctx: TickContext): ProposedAction[] {
  const world = withTick(ctx);
  switch (agent.role) {
    case "consumer":
      return orIdle(decideConsumer(agent, world));
    case "merchant":
      return orIdle(decideMerchant(agent, world));
    case "worker":
      return orIdle(decideWorker(agent, world));
    case "treasurer":
      return orIdle(decideTreasurer(world));
  }
}

function pickSeller(world: WorldState): AgentName {
  const merchants = ROSTER.filter((a) => a.role === "merchant");
  const stocked = merchants.find((m) => (world.inventory[m.name] ?? 0) > 0);
  return stocked?.name ?? merchants[0]?.name ?? AGENT_NAMES[1];
}

function decideConsumer(agent: RosterEntry, world: WorldState): ProposedAction[] {
  const price = usdcBigint(world.merchantPriceUsdc);
  const balance = usdcBigint(world.balances[agent.name]);
  if (price === 0n || balance <= price * BigInt(CONSUMER_BUY_MULTIPLIER)) return [];
  return [{ kind: "buy", amountUsdc: world.merchantPriceUsdc, to: pickSeller(world) }];
}

function decideMerchant(agent: RosterEntry, world: WorldState): ProposedAction[] {
  const actions: ProposedAction[] = [];
  const cash = usdcBigint(world.balances[agent.name]);
  const stock = world.inventory[agent.name] ?? MERCHANT_MIN_INVENTORY;
  const pay = mulUsdcRatio(world.restockCostUsdc, 6n, 5n); // MERCHANT_JOB_PAY_MULT 1.2

  if (stock < MERCHANT_MIN_INVENTORY) {
    actions.push({ kind: "post_job", amountUsdc: pay });
    if (cash >= usdcBigint(pay)) {
      actions.push({ kind: "fund_escrow", amountUsdc: pay });
    } else {
      actions.push({ kind: "request_loan", amountUsdc: pay });
    }
  }

  const loan = world.loans
    .filter(
      (l) => l.borrower === agent.name && l.status === "approved" && isRosterAgent(l.borrower),
    )
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (loan && cash > (usdcBigint(loan.principalUsdc) * 3n) / 2n) {
    actions.push({ kind: "repay", loanId: loan.id, amountUsdc: loan.principalUsdc });
  }
  return actions;
}

function bestOpenJob(world: WorldState): WorldState["jobs"][number] | undefined {
  const taken = new Set(world.assignments.map((a) => a.jobId));
  const open = world.jobs.filter(
    (j) => j.status === "open" && isRosterAgent(j.client) && !taken.has(j.id),
  );
  return open.sort((a, b) => {
    const pay = usdcBigint(b.amountUsdc) - usdcBigint(a.amountUsdc);
    if (pay !== 0n) return pay > 0n ? 1 : -1;
    return a.id.localeCompare(b.id);
  })[0];
}

function decideWorker(agent: RosterEntry, world: WorldState): ProposedAction[] {
  const actions: ProposedAction[] = [];
  const mine = world.assignments.filter((a) => a.worker === agent.name);
  const due = mine.filter((a) => world.tick >= a.acceptedAtTick + WORKER_DELIVER_TICKS);
  const held = mine.filter((a) => world.tick < a.acceptedAtTick + WORKER_DELIVER_TICKS);
  for (const a of due.sort((x, y) => x.jobId.localeCompare(y.jobId))) {
    actions.push({ kind: "deliver", jobId: a.jobId });
  }
  if (held.length === 0) {
    const job = bestOpenJob(world);
    if (job) actions.push({ kind: "accept_job", jobId: job.id, amountUsdc: job.amountUsdc });
  }
  const payout = world.settledPayouts[agent.name];
  if (payout && usdcBigint(payout) > 0n) {
    const deposit = mulUsdcRatio(payout, BigInt(WORKER_DEPOSIT_PCT), 100n);
    if (usdcBigint(deposit) > 0n) actions.push({ kind: "deposit", amountUsdc: deposit });
  }
  return actions;
}

function maybeApprove(world: WorldState): ProposedAction | undefined {
  const pending = world.loans
    .filter((l) => l.status === "pending" && isRosterAgent(l.borrower))
    .sort((a, b) => a.id.localeCompare(b.id));
  const loan = pending[0];
  if (!loan || !isRosterAgent(loan.borrower)) return undefined;
  const score = world.creditScores[loan.borrower] ?? 0;
  if (score < TREASURER_MIN_SCORE) return undefined;
  if (world.treasury.utilisationBps >= TREASURER_MAX_UTILISATION_BPS) return undefined;
  return { kind: "approve_loan", loanId: loan.id, amountUsdc: loan.principalUsdc };
}

function maybeDefault(world: WorldState): ProposedAction | undefined {
  const dueAt = (approved: number) => approved + LOAN_TERM_TICKS;
  const overdue = world.loans
    .filter(
      (l) =>
        l.status === "approved" &&
        isRosterAgent(l.borrower) &&
        l.approvedAtTick !== null &&
        world.tick >= dueAt(l.approvedAtTick) + GRACE_TICKS,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const loan = overdue[0];
  if (!loan) return undefined;
  return { kind: "mark_default", loanId: loan.id, amountUsdc: loan.principalUsdc };
}

function maybeRate(world: WorldState): ProposedAction | undefined {
  const computed = computeTownRateBps({
    marketApyBps: world.signals.usdcBorrowApyBps,
    spreadBps: BASE_RATE_SPREAD_BPS,
    defaultPremiumBps: world.treasury.defaults > 0 ? DEFAULT_PREMIUM_BPS : 0,
  });
  if (computed === world.treasury.baseRateBps) return undefined;
  return { kind: "set_rate", bps: computed };
}

function maybeStipend(world: WorldState): ProposedAction | undefined {
  if (world.tick % STIPEND_EVERY_TICKS !== 0) return undefined;
  const consumers = ROSTER.filter(
    (a) => a.role === "consumer" && world.balances[a.name] !== undefined,
  );
  if (consumers.length === 0) return undefined;
  return { kind: "pay_stipend", amountUsdc: STIPEND_USDC };
}

function decideTreasurer(world: WorldState): ProposedAction[] {
  const actions: ProposedAction[] = [];
  const approve = maybeApprove(world);
  if (approve) actions.push(approve);
  const def = maybeDefault(world);
  if (def) actions.push(def);
  const rate = maybeRate(world);
  if (rate) actions.push(rate);
  const stipend = maybeStipend(world);
  if (stipend) actions.push(stipend);
  return actions;
}

export type { ActionKind, AgentName, WorldState };
export { emptyWorld, loadWorld } from "./world.js";
