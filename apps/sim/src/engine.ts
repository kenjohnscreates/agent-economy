// Tick engine — advances ticks, persists ledger rows, fires storyline hooks.
// Phase comes from phaseForTick when STORYLINE=demo; free-run stays at 'boom'.
// Stops when tick >= MAX_TICKS. Actions are idempotent on (tick, agent, kind).
import { ROSTER, phaseForTick, type StorylineMode, type StorylinePhase } from "@agent-town/shared";
import type { SimConfig } from "./config.js";
import { decide } from "./decide.js";
import type { Ledger } from "./ledger/index.js";
import { onTick } from "./storyline-hooks.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Demo uses the PRD §12 table; free-run holds a constant boom phase. */
export function phaseForConfig(tick: number, storyline: StorylineMode): StorylinePhase {
  if (storyline === "demo") return phaseForTick(tick);
  return "boom";
}

export async function runSingleTick(ledger: Ledger, config: SimConfig): Promise<number> {
  const current = await ledger.getCurrentTick();
  const nextTick = current + 1;
  if (nextTick > config.maxTicks) return current;

  const phase = phaseForConfig(nextTick, config.flags.storyline);
  await ledger.insertTick({
    id: nextTick,
    ts: new Date().toISOString(),
    phase,
  });

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
  }

  await onTick(nextTick, phase);
  console.log(`[sim] tick ${nextTick} phase=${phase}`);
  return nextTick;
}

/** Advance up to `count` ticks; stops early when MAX_TICKS is reached. */
export async function runTicks(
  ledger: Ledger,
  config: SimConfig,
  count: number,
): Promise<number> {
  let last = await ledger.getCurrentTick();
  for (let i = 0; i < count; i++) {
    const after = await runSingleTick(ledger, config);
    if (after === last) break;
    last = after;
  }
  return last;
}

/** Continuous loop — waits TICK_MS between ticks until MAX_TICKS. */
export async function runLoop(ledger: Ledger, config: SimConfig): Promise<void> {
  while (true) {
    const before = await ledger.getCurrentTick();
    const after = await runSingleTick(ledger, config);
    if (after === before) break;
    await sleep(config.tickMs);
  }
}
