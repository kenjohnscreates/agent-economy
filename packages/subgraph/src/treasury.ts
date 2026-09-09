// TownTreasury event handlers. Index deposits, loans, funding, stipends, AgentRegistered.
// Inputs: TownTreasury events on arc-testnet. Do not index ERC-20 Transfer (RISKS R4).
// Outputs: Agent, Loan, Payment, TreasurySnapshot, TreasuryState. SpreadSet/MaxLoanSet no-op.

import { BigInt } from "@graphprotocol/graph-ts";
import {
  AgentRegistered,
  BaseRateSet,
  Defaulted,
  Deposited,
  Funded,
  LoanApproved,
  LoanDenied,
  LoanRequested,
  MaxLoanSet,
  Repaid,
  SpreadSet,
  StipendPaid,
  Withdrawn,
} from "../generated/TownTreasury/TownTreasury";
import {
  getOrCreateAgent,
  getOrCreateLoan,
  getOrCreateTreasuryState,
  recordPayment,
  snapshotTreasury,
} from "./helpers";

/** Agent deposits USDC into the treasury. */
export function handleDeposited(event: Deposited): void {
  let agent = getOrCreateAgent(event.params.agent);
  agent.balanceDeposited = agent.balanceDeposited.plus(event.params.amount);
  agent.save();
  let state = getOrCreateTreasuryState();
  state.balance = state.balance.plus(event.params.amount);
  state.save();
  recordPayment(event, event.params.agent, event.address, event.params.amount, "deposit");
  snapshotTreasury(event);
}

/** Agent withdraws savings. */
export function handleWithdrawn(event: Withdrawn): void {
  let agent = getOrCreateAgent(event.params.agent);
  agent.balanceDeposited = agent.balanceDeposited.minus(event.params.amount);
  agent.save();
  let state = getOrCreateTreasuryState();
  state.balance = state.balance.minus(event.params.amount);
  state.save();
  recordPayment(event, event.address, event.params.agent, event.params.amount, "withdraw");
  snapshotTreasury(event);
}

/** Loan request sits pending until approve/deny. */
export function handleLoanRequested(event: LoanRequested): void {
  getOrCreateLoan(
    event.params.loanId,
    event.params.borrower,
    event.params.amount,
    event.block.timestamp,
  );
}

/** Pending → approved. Disburse principal; loansTaken++. */
export function handleLoanApproved(event: LoanApproved): void {
  let loan = getOrCreateLoan(
    event.params.loanId,
    event.params.borrower,
    event.params.amount,
    event.block.timestamp,
  );
  loan.status = "approved";
  loan.principal = event.params.amount;
  loan.rateBps = event.params.rateBps;
  loan.approvedAt = event.block.timestamp;
  loan.borrower = event.params.borrower;
  loan.save();
  let borrower = getOrCreateAgent(event.params.borrower);
  borrower.loansTaken = borrower.loansTaken + 1;
  borrower.save();
  let state = getOrCreateTreasuryState();
  state.outstanding = state.outstanding.plus(event.params.amount);
  state.balance = state.balance.minus(event.params.amount);
  state.save();
  snapshotTreasury(event);
}

/** Pending → denied. */
export function handleLoanDenied(event: LoanDenied): void {
  let loan = getOrCreateLoan(
    event.params.loanId,
    event.params.borrower,
    BigInt.fromI32(0),
    event.block.timestamp,
  );
  loan.status = "denied";
  loan.save();
}

/** Accumulate repaid; approved → repaid iff principalRemaining == 0. */
export function handleRepaid(event: Repaid): void {
  let loan = getOrCreateLoan(
    event.params.loanId,
    event.params.borrower,
    BigInt.fromI32(0),
    event.block.timestamp,
  );
  loan.repaid = loan.repaid.plus(event.params.amount);
  if (event.params.principalRemaining.equals(BigInt.fromI32(0))) {
    loan.status = "repaid";
  }
  loan.save();
  let principalPaid = event.params.amount.minus(event.params.interestPaid);
  let state = getOrCreateTreasuryState();
  state.outstanding = state.outstanding.minus(principalPaid);
  state.balance = state.balance.plus(event.params.amount);
  state.save();
  recordPayment(event, event.params.borrower, event.address, event.params.amount, "repay");
  snapshotTreasury(event);
}

/** Approved → defaulted (terminal). outstanding -= principalRemaining. */
export function handleDefaulted(event: Defaulted): void {
  let loan = getOrCreateLoan(
    event.params.loanId,
    event.params.borrower,
    event.params.principalRemaining,
    event.block.timestamp,
  );
  loan.status = "defaulted";
  loan.defaultedAt = event.block.timestamp;
  loan.save();
  let borrower = getOrCreateAgent(event.params.borrower);
  borrower.defaults = borrower.defaults + 1;
  borrower.save();
  let state = getOrCreateTreasuryState();
  state.outstanding = state.outstanding.minus(event.params.principalRemaining);
  state.save();
  snapshotTreasury(event);
}

/** Persist baseRateBps; default 0 until first event. No snapshot. */
export function handleBaseRateSet(event: BaseRateSet): void {
  let state = getOrCreateTreasuryState();
  state.baseRateBps = event.params.bps;
  state.save();
}

/** Rate spread is not in the schema; no-op. */
export function handleSpreadSet(_event: SpreadSet): void {}

/** Max loan cap is not in the schema; no-op. */
export function handleMaxLoanSet(_event: MaxLoanSet): void {}

/** Equity top-up. Anyone may fund. */
export function handleFunded(event: Funded): void {
  let state = getOrCreateTreasuryState();
  state.balance = state.balance.plus(event.params.amount);
  state.save();
  recordPayment(event, event.params.from, event.address, event.params.amount, "fund");
  snapshotTreasury(event);
}

/** Stipend from treasury equity to an agent. */
export function handleStipendPaid(event: StipendPaid): void {
  let state = getOrCreateTreasuryState();
  state.balance = state.balance.minus(event.params.amount);
  state.save();
  recordPayment(event, event.address, event.params.to, event.params.amount, "stipend");
  snapshotTreasury(event);
}

/** Join path: write ensName. Do not invent role. */
export function handleAgentRegistered(event: AgentRegistered): void {
  let agent = getOrCreateAgent(event.params.agent);
  agent.ensName = event.params.ensName;
  agent.save();
}
