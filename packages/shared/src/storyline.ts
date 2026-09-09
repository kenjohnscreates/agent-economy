// Demo storyline — phase per tick, keyed by tick number (never wall-clock) so
// the same script plays at any TICK_MS. Source: PRD §12, ARCHITECTURE §6.1.
// Inputs: tick number. Outputs: `StorylinePhase` union + schema, `DEMO_STORYLINE`
// table and `phaseForTick(tick)`. Ticks beyond the table stay in 'recover'.
import { z } from "zod";

export const STORYLINE_PHASES = ["boom", "borrow", "default", "hike", "recover"] as const;
export const StorylinePhaseSchema = z.enum(STORYLINE_PHASES);
export type StorylinePhase = z.infer<typeof StorylinePhaseSchema>;

/** Storyline flag values (env `STORYLINE=demo|free`). */
export const STORYLINE_MODES = ["demo", "free"] as const;
export const StorylineModeSchema = z.enum(STORYLINE_MODES);
export type StorylineMode = z.infer<typeof StorylineModeSchema>;

/** Number of scripted ticks in the demo (12 × 15 s ≈ 3 min). */
export const DEMO_TICKS = 12 as const;

/**
 * Tick → phase table (PRD §12): 1–3 boom, 4–5 borrow, 6–8 default,
 * 9–10 hike (mayor steps in), 11–12 recover.
 */
export const DEMO_STORYLINE: Readonly<Record<number, StorylinePhase>> = {
  1: "boom",
  2: "boom",
  3: "boom",
  4: "borrow",
  5: "borrow",
  6: "default",
  7: "default",
  8: "default",
  9: "hike",
  10: "hike",
  11: "recover",
  12: "recover",
};

/**
 * Phase for a tick. Non-integers are floored, values < 1 (incl. tick 0 / NaN)
 * clamp to 1 → 'boom'; ticks > DEMO_TICKS stay 'recover'.
 */
export function phaseForTick(tick: number): StorylinePhase {
  const t = Number.isFinite(tick) ? Math.max(1, Math.floor(tick)) : 1;
  return DEMO_STORYLINE[t] ?? "recover";
}
