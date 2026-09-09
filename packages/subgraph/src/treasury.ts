// TownTreasury event handlers. Business logic lands in M3.2.
// Inputs: events from TownTreasury.sol on arc-testnet.
// Outputs: Agent, Loan, Payment, TreasurySnapshot, TownStat (empty until M3.2).

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

export function handleDeposited(_event: Deposited): void {}

export function handleWithdrawn(_event: Withdrawn): void {}

export function handleLoanRequested(_event: LoanRequested): void {}

export function handleLoanApproved(_event: LoanApproved): void {}

export function handleLoanDenied(_event: LoanDenied): void {}

export function handleRepaid(_event: Repaid): void {}

export function handleDefaulted(_event: Defaulted): void {}

export function handleBaseRateSet(_event: BaseRateSet): void {}

export function handleSpreadSet(_event: SpreadSet): void {}

export function handleMaxLoanSet(_event: MaxLoanSet): void {}

export function handleFunded(_event: Funded): void {}

export function handleStipendPaid(_event: StipendPaid): void {}

export function handleAgentRegistered(_event: AgentRegistered): void {}
