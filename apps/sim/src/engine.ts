// Tick engine — advances ticks, persists ledger rows, fires storyline hooks.
// Phase comes from phaseForTick when STORYLINE=demo; free-run stays at 'boom'.
// Stops when tick >= MAX_TICKS. Actions are idempotent on (tick, agent, kind).
// After decide/actions, batches one narration bubble per roster agent (M4.5).
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
import type { Ledger } from "./ledger/index.js";
import { narrate, type LlmProvider } from "./narrator.js";
import { onTick } from "./storyline-hooks.js";

export interface TickDeps {
  narratorProvider?: LlmProvider;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  for (const agent of ROSTER) {
    const proposed = decide(agent, { tick: nextTick, phase });
    for (const action of proposed) {
      await ledger.insertAction({
        tick: nextTick,
        agent: agent.name,
        kind: action.kind,
        tx: null,
        status: "skipped",
      });
    }
    lastKind.set(agent.name, proposed[proposed.length - 1]?.kind ?? "idle");
  }

  await persistNarration(ledger, config, nextTick, phase, lastKind, deps.narratorProvider);
  await onTick(nextTick, phase);
  console.log(`[sim] tick ${nextTick} phase=${phase}`);
  return nextTick;
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
