// Tick engine — advances ticks, persists ledger rows, fires storyline hooks.
// Phase comes from phaseForTick when STORYLINE=demo; free-run stays at 'boom'.
// Stops when tick >= MAX_TICKS. Actions are idempotent on (tick, agent, kind).
// World via optional getWorld; default emptyWorld keeps decide idle (M4.1 tests).
// After decide/actions, batches one narration bubble per roster agent (M4.5).
// M4.3: optional executeAction maps ProposedAction → Circle tx (dry-run default).
// M4.6: skipped repay/mark_default never call applyEnsSideEffects (no chain writes).
import {
  ROSTER,
  phaseForTick,
  type ActionKind,
  type AgentName,
  type StorylineMode,
  type StorylinePhase,
} from "@agent-town/shared";
import type { SimConfig } from "./config.js";
import { decide } from "./decide.js";
import { EXECUTE_SKIP_KINDS, type ExecuteActionFn } from "./execute.js";
import { emptyWorld, type WorldState } from "./world.js";
import { maybeApplyEnsSideEffects, type EnsLoanOutcomeEvent } from "./ens-side-effects.js";
import type { ActionStatus, Ledger } from "./ledger/index.js";
import { narrate, type LlmProvider } from "./narrator.js";
import { onTick } from "./storyline-hooks.js";

export interface TickDeps {
  narratorProvider?: LlmProvider;
  /** M4.3 injects Circle execution. Omitted or dry-run → ledger status skipped. */
  executeAction?: ExecuteActionFn;
  /** M4.6 injects `applyLoanOutcome`. Skipped/--once never write chain. */
  applyEnsSideEffects?: (event: EnsLoanOutcomeEvent) => Promise<void>;
  /** Optional world snapshot (subgraph + Signal C). Default empty → idle. */
  getWorld?: (tick: number) => WorldState | Promise<WorldState>;
}

async function persistAction(
  ledger: Ledger,
  tick: number,
  agent: AgentName,
  action: ReturnType<typeof decide>[number],
  config: SimConfig,
  executeAction?: ExecuteActionFn,
): Promise<ActionStatus> {
  const existing = await ledger.findAction(tick, agent, action.kind);
  if (existing?.status === "complete") return existing.status;
  if (existing) return existing.status;

  const skipExecute =
    !executeAction || !config.executeEnabled || EXECUTE_SKIP_KINDS.has(action.kind);

  if (skipExecute) {
    await ledger.insertAction({
      tick,
      agent,
      kind: action.kind,
      tx: null,
      status: "skipped",
    });
    return "skipped";
  }

  const result = await executeAction({ tick, agent, action });
  const status = result.status;
  const tx =
    result.status === "complete"
      ? result.txHash
      : result.status === "failed"
        ? (result.txHash ?? null)
        : null;

  if (result.status === "failed") {
    console.error(`[sim] execute ${action.kind} (${agent} tick ${tick}): ${result.error}`);
  } else if (result.status === "pending") {
    console.warn(
      `[sim] execute ${action.kind} (${agent} tick ${tick}) pending: ${result.error ?? result.txId}`,
    );
  }

  await ledger.insertAction({ tick, agent, kind: action.kind, tx, status });
  return status;
}

/** Demo uses the PRD §12 table; free-run holds a constant boom phase. */
export function phaseForConfig(tick: number, storyline: StorylineMode): StorylinePhase {
  if (storyline === "demo") return phaseForTick(tick);
  return "boom";
}

async function persistNarration(
  ledger: Ledger,
  config: SimConfig,
  tick: number,
  phase: StorylinePhase,
  lastKind: Map<AgentName, ActionKind>,
  provider?: LlmProvider,
): Promise<void> {
  await Promise.all(
    ROSTER.map(async (agent) => {
      const text = await narrate(
        agent,
        { tick, phase, lastActionKind: lastKind.get(agent.name) ?? "idle" },
        config.flags,
        provider,
      );
      await ledger.insertNarration({ tick, agent: agent.name, text });
    }),
  );
}

export async function runSingleTick(
  ledger: Ledger,
  config: SimConfig,
  deps: TickDeps = {},
): Promise<number> {
  const current = await ledger.getCurrentTick();
  const nextTick = current + 1;
  if (nextTick > config.maxTicks) return current;

  const phase = phaseForConfig(nextTick, config.flags.storyline);
  await ledger.insertTick({
    id: nextTick,
    ts: new Date().toISOString(),
    phase,
  });

  const lastKind = new Map<AgentName, ActionKind>();
  const world = deps.getWorld ? await deps.getWorld(nextTick) : emptyWorld(nextTick);
  for (const agent of ROSTER) {
    const proposed = decide(agent, { tick: nextTick, phase, world });
    for (const action of proposed) {
      const status = await persistAction(
        ledger,
        nextTick,
        agent.name,
        action,
        config,
        deps.executeAction,
      );
      if (action.kind === "repay" || action.kind === "mark_default") {
        await maybeApplyEnsSideEffects(
          { agent: agent.name, kind: action.kind, tick: nextTick, status },
          deps.applyEnsSideEffects,
        );
      }
    }
    lastKind.set(agent.name, proposed[proposed.length - 1]?.kind ?? "idle");
  }

  await persistNarration(ledger, config, nextTick, phase, lastKind, deps.narratorProvider);
  await onTick(nextTick, phase);
  console.log(`[sim] tick ${nextTick} phase=${phase}`);
  return nextTick;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Advance up to `count` ticks; stops early when MAX_TICKS is reached. */
export async function runTicks(
  ledger: Ledger,
  config: SimConfig,
  count: number,
  deps: TickDeps = {},
): Promise<number> {
  let last = await ledger.getCurrentTick();
  for (let i = 0; i < count; i++) {
    const after = await runSingleTick(ledger, config, deps);
    if (after === last) break;
    last = after;
  }
  return last;
}

/** Continuous loop — waits TICK_MS between ticks until MAX_TICKS. */
export async function runLoop(
  ledger: Ledger,
  config: SimConfig,
  deps: TickDeps = {},
): Promise<void> {
  while (true) {
    const before = await ledger.getCurrentTick();
    const after = await runSingleTick(ledger, config, deps);
    if (after === before) break;
    await sleep(config.tickMs);
  }
}
