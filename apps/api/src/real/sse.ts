// SSE diff helpers — emit tick/narration/tx/loan_flagged on ledger/subgraph changes.
// Ledger-only refresh (Studio 429) still emits tick/narration with last-good scoreboard.
import {
  ARC_EXPLORER_URL,
  type Loan,
  type ScoreboardResponse,
  type SseEvent,
  type StorylinePhase,
  type TxEvent,
} from "@agent-town/shared";
import type { LedgerAction, LedgerNarration } from "./ledger.js";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export interface SseCursor {
  tick: number;
  actionKeys: Set<string>;
  narrationKeys: Set<string>;
  pendingLoanIds: Set<string>;
  initialized: boolean;
}

export function emptySseCursor(): SseCursor {
  return {
    tick: 0,
    actionKeys: new Set(),
    narrationKeys: new Set(),
    pendingLoanIds: new Set(),
    initialized: false,
  };
}

function actionKey(a: Pick<LedgerAction, "tick" | "agent" | "kind">): string {
  return `${a.tick}:${a.agent}:${a.kind}`;
}

function narrationKey(n: Pick<LedgerNarration, "tick" | "agent">): string {
  return `${n.tick}:${n.agent}`;
}

function txFromAction(action: LedgerAction): TxEvent | undefined {
  if (!action.tx || !TX_HASH_RE.test(action.tx)) return undefined;
  const status =
    action.status === "complete"
      ? "complete"
      : action.status === "failed"
        ? "failed"
        : "pending";
  return {
    tick: action.tick,
    agent: action.agent,
    kind: action.kind,
    amountUsdc: null,
    counterparty: null,
    txHash: action.tx,
    explorerUrl: `${ARC_EXPLORER_URL}/tx/${action.tx}`,
    status,
  };
}

/** Build SSE frames for one refresh; seeds cursor on first call without emitting. */
export function diffSseEvents(input: {
  cursor: SseCursor;
  tick: number;
  phase: StorylinePhase;
  actions: LedgerAction[];
  narrations: LedgerNarration[];
  loans: Loan[];
  scoreboard: ScoreboardResponse;
}): SseEvent[] {
  const events: SseEvent[] = [];

  if (!input.cursor.initialized) {
    input.cursor.tick = input.tick;
    for (const a of input.actions) input.cursor.actionKeys.add(actionKey(a));
    for (const n of input.narrations) input.cursor.narrationKeys.add(narrationKey(n));
    for (const l of input.loans) {
      if (l.status === "pending") input.cursor.pendingLoanIds.add(l.id);
    }
    input.cursor.initialized = true;
    return events;
  }

  if (input.tick !== input.cursor.tick) {
    events.push({ event: "tick", data: { tick: input.tick, phase: input.phase } });
    input.cursor.tick = input.tick;
  }

  for (const action of input.actions) {
    const key = actionKey(action);
    if (input.cursor.actionKeys.has(key)) continue;
    input.cursor.actionKeys.add(key);
    const tx = txFromAction(action);
    if (tx) events.push({ event: "tx", data: tx });
  }

  for (const narration of input.narrations) {
    const key = narrationKey(narration);
    if (input.cursor.narrationKeys.has(key)) continue;
    input.cursor.narrationKeys.add(key);
    events.push({
      event: "narration",
      data: { tick: narration.tick, agent: narration.agent, text: narration.text },
    });
  }

  for (const loan of input.loans) {
    if (loan.status !== "pending" || input.cursor.pendingLoanIds.has(loan.id)) continue;
    input.cursor.pendingLoanIds.add(loan.id);
    events.push({ event: "loan_flagged", data: loan });
  }

  events.push({ event: "scoreboard", data: input.scoreboard });
  return events;
}
