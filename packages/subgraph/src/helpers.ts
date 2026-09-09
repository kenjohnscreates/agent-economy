// Load-or-create helpers for Agent Town mappings (ARCHITECTURE §5).
// Inputs: event addresses/ids. Outputs: Agent, Loan, Payment, TreasuryState, snapshots, TownStat.

import { Address, BigInt, Bytes, Value, ethereum } from "@graphprotocol/graph-ts";
import {
  Agent,
  Loan,
  Payment,
  TreasurySnapshot,
  TreasuryState,
  TownStat,
} from "../generated/schema";

export const ZERO = BigInt.fromI32(0);
export const TREASURY_STATE_ID = "treasury";

/** Agent.id = address Bytes. Shells get empty ensName; never invent role. */
export function getOrCreateAgent(address: Bytes): Agent {
  let agent = Agent.load(address);
  if (agent != null) {
    return agent;
  }
  agent = new Agent(address);
  agent.ensName = "";
  agent.balanceDeposited = ZERO;
  agent.loansTaken = 0;
  agent.defaults = 0;
  agent.jobsCompleted = 0;
  agent.earned = ZERO;
  agent.spent = ZERO;
  agent.save();
  return agent;
}

export function getOrCreateTreasuryState(): TreasuryState {
  let state = TreasuryState.load(TREASURY_STATE_ID);
  if (state != null) {
    return state;
  }
  state = new TreasuryState(TREASURY_STATE_ID);
  state.balance = ZERO;
  state.outstanding = ZERO;
  state.baseRateBps = 0;
  state.save();
  return state;
}

export function eventEntityId(event: ethereum.Event): Bytes {
  return event.transaction.hash.concatI32(event.logIndex.toI32());
}

/** Skip Payment when from/to would be address(0). Bank side uses TownTreasury as Agent. */
export function recordPayment(
  event: ethereum.Event,
  from: Bytes,
  to: Bytes,
  amount: BigInt,
  kind: string,
): void {
  if (from.equals(Address.zero()) || to.equals(Address.zero())) {
    return;
  }
  getOrCreateAgent(from);
  getOrCreateAgent(to);
  let payment = new Payment(eventEntityId(event));
  payment.from = from;
  payment.to = to;
  payment.amount = amount;
  payment.kind = kind;
  payment.tx = event.transaction.hash;
  payment.timestamp = event.block.timestamp;
  payment.save();
}

export function snapshotTreasury(event: ethereum.Event): void {
  let state = getOrCreateTreasuryState();
  let snap = new TreasurySnapshot(eventEntityId(event));
  snap.balance = state.balance;
  snap.outstanding = state.outstanding;
  snap.baseRateBps = state.baseRateBps;
  snap.timestamp = event.block.timestamp;
  snap.save();
}

/** TownStat timeseries row. Store timestamp as Int8 so Matchstick 0.6 can load it; graph-node overrides to Timestamp. */
export function emitTownStat(event: ethereum.Event, volume: BigInt): void {
  let id = event.block.timestamp.toI64() * 1000000 + event.logIndex.toI64();
  let stat = new TownStat(id);
  stat.set("timestamp", Value.fromI64(event.block.timestamp.toI64()));
  stat.volume = volume;
  stat.save();
}

export function getOrCreateLoan(
  loanId: BigInt,
  borrower: Address,
  principal: BigInt,
  requestedAt: BigInt,
): Loan {
  let id = loanId.toString();
  let loan = Loan.load(id);
  if (loan != null) {
    return loan;
  }
  getOrCreateAgent(borrower);
  loan = new Loan(id);
  loan.borrower = borrower;
  loan.principal = principal;
  loan.rateBps = 0;
  loan.status = "pending";
  loan.requestedAt = requestedAt;
  loan.repaid = ZERO;
  loan.save();
  return loan;
}
