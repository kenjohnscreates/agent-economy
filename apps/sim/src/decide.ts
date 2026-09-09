// Agent decision stub — returns a no-op idle action per agent (M4.2 adds rules).
// Inputs: roster entry + tick context. Outputs: proposed actions before ledger
// idempotency filtering. Circle execution arrives in M4.3.
import type { ActionKind, AgentName, RosterEntry, StorylinePhase } from "@agent-town/shared";

export interface TickContext {
  tick: number;
  phase: StorylinePhase;
}

export interface ProposedAction {
  kind: ActionKind;
}

/** Rules engine placeholder — every agent idles until M4.2 wires role logic. */
export function decide(agent: RosterEntry, ctx: TickContext): ProposedAction[] {
  void agent;
  void ctx;
  return [{ kind: "idle" }];
}

export type { AgentName };
