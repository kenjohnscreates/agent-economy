// Who pays whom for a tx event. Shared by the feed and the map (coin sprites).
// The contract gives `agent` (initiator), `kind`, and `counterparty` (other party,
// or "treasury" / "escrow"). Direction is a property of `kind`, not of the payload.
import type { ActionKind, TxEvent } from "@agent-town/shared";

export const TREASURY = "treasury" as const;
export const ESCROW = "escrow" as const;

export interface TxDirection {
  /** Party that loses USDC, or null when the action moves no money. */
  from: string | null;
  /** Party that gains USDC, or null when the action moves no money. */
  to: string | null;
}

type Rule = (agent: string, counterparty: string | null) => TxDirection;
const NONE: TxDirection = { from: null, to: null };

const RULES: Record<ActionKind, Rule> = {
  buy: (a, c) => ({ from: a, to: c }),
  post_job: () => NONE,
  fund_escrow: (a) => ({ from: a, to: ESCROW }),
  accept_job: () => NONE,
  deliver: () => NONE,
  // Client completes the job; escrow releases pay to the provider (counterparty).
  complete_job: (a, c) => ({ from: ESCROW, to: c ?? a }),
  deposit: (a) => ({ from: a, to: TREASURY }),
  withdraw: (a) => ({ from: TREASURY, to: a }),
  request_loan: () => NONE,
  // Treasurer or mayor approves; borrower is the counterparty.
  approve_loan: (a, c) => ({ from: TREASURY, to: c ?? a }),
  deny_loan: () => NONE,
  repay: (a) => ({ from: a, to: TREASURY }),
  mark_default: () => NONE,
  set_rate: () => NONE,
  // Treasury pays the consumer; the mock sometimes puts the consumer in `counterparty`.
  pay_stipend: (a, c) => ({ from: TREASURY, to: c && c !== TREASURY ? c : a }),
  set_credit_score: () => NONE,
  append_review: () => NONE,
  idle: () => NONE,
};

export function txDirection(
  kind: ActionKind,
  agent: string,
  counterparty: string | null,
): TxDirection {
  return RULES[kind](agent, counterparty);
}

/** True when the event should render as money moving (coin on the map, arrow in the feed). */
export function isMonetary(
  e: Pick<TxEvent, "kind" | "agent" | "counterparty" | "amountUsdc">,
): boolean {
  if (e.amountUsdc == null) return false;
  const d = txDirection(e.kind, e.agent, e.counterparty);
  return d.from != null && d.to != null;
}
