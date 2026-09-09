// Storyline hook stub — keyed by tick number, never wall-clock (ARCHITECTURE §6.1).
// M4.8 will schedule boom → borrow → default → hike → recover side-effects here.
// M4.6: repay/default → ENS via `applyLoanOutcome` (@agent-town/ens); see ens-side-effects.ts.
import type { StorylinePhase } from "@agent-town/shared";

export async function onTick(tick: number, phase: StorylinePhase): Promise<void> {
  console.log(`[sim] storyline hook tick=${tick} phase=${phase}`);
}
