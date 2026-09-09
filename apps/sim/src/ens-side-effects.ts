// M4.6 thin hook — sim/circle call `applyLoanOutcome` from @agent-town/ens later (M4.3).
// Inputs: a ledger action. Outputs: no-op unless an apply fn is injected AND status is
// not skipped. `--once` / skipped actions never write chain.
import type { ActionKind, AgentName } from "@agent-town/shared";
import type { ActionStatus } from "./ledger/types.js";

export type EnsLoanKind = Extract<ActionKind, "repay" | "mark_default">;

export interface EnsLoanOutcomeEvent {
  agent: AgentName;
  kind: EnsLoanKind;
  tick: number;
  status: ActionStatus;
}

export async function maybeApplyEnsSideEffects(
  event: EnsLoanOutcomeEvent,
  apply?: (event: EnsLoanOutcomeEvent) => Promise<void>,
): Promise<void> {
  if (event.status === "skipped") return;
  if (!apply) return;
  await apply(event);
}
