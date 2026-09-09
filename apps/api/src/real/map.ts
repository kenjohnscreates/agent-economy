// Subgraph DTO → shared API shapes (USDC stays 6-dec strings).
import {
  LOAN_TERM_TICKS,
  type AgentName,
  type GdpPoint,
  type Job,
  type JobStatus,
  type Loan,
  type LoanStatus,
} from "@agent-town/shared";
import type { SubgraphJob, SubgraphLoan } from "@agent-town/graphclient";

const TICK_LIKE_MAX = 10_000;

/** Unix seconds or small test ticks → sim tick id. */
export function toTick(raw: string, anchorSec: number, tickMs: number): number {
  const n = BigInt(raw);
  if (n < BigInt(TICK_LIKE_MAX)) return Number(n);
  if (!anchorSec || tickMs <= 0) return 0;
  const elapsed = Number(n) - anchorSec;
  if (elapsed < 0) return 1;
  return Math.max(1, Math.floor(elapsed / (tickMs / 1000)) + 1);
}

export function agentLabelFromEns(ensName: string | null | undefined, townName: string): AgentName | null {
  if (!ensName) return null;
  const suffix = `.${townName.replace(/\.eth$/i, "")}.eth`;
  if (!ensName.toLowerCase().endsWith(suffix)) return null;
  const label = ensName.slice(0, -suffix.length).toLowerCase();
  return label as AgentName;
}

export function mapLoanStatus(status: string): LoanStatus {
  const s = status as LoanStatus;
  if (
    s === "pending" ||
    s === "approved" ||
    s === "denied" ||
    s === "repaid" ||
    s === "defaulted"
  ) {
    return s;
  }
  return "pending";
}

export function mapJobStatus(status: string): JobStatus {
  const s = status as JobStatus;
  if (
    s === "open" ||
    s === "funded" ||
    s === "submitted" ||
    s === "completed" ||
    s === "rejected" ||
    s === "expired"
  ) {
    return s;
  }
  return "open";
}

export function mapLoan(
  loan: SubgraphLoan,
  townName: string,
  anchorSec: number,
  tickMs: number,
): Loan {
  const approvedAtTick =
    loan.approvedAt !== null ? toTick(loan.approvedAt, anchorSec, tickMs) : null;
  const requestedAtTick = toTick(loan.requestedAt, anchorSec, tickMs);
  const defaultedAtTick =
    loan.defaultedAt !== null ? toTick(loan.defaultedAt, anchorSec, tickMs) : null;
  return {
    id: loan.id,
    borrower: agentLabelFromEns(loan.borrower.ensName, townName) ?? loan.borrower.id,
    principalUsdc: loan.principal,
    rateBps: loan.rateBps,
    status: mapLoanStatus(loan.status),
    requestedAtTick,
    approvedAtTick,
    dueAtTick: approvedAtTick !== null ? approvedAtTick + LOAN_TERM_TICKS : null,
    repaidUsdc: loan.repaid,
    defaultedAtTick,
    advisor: null,
  };
}

export function mapJob(
  job: SubgraphJob,
  townName: string,
  anchorSec: number,
  tickMs: number,
): Job {
  return {
    id: job.id,
    client: agentLabelFromEns(job.client.ensName, townName) ?? job.client.id,
    provider: agentLabelFromEns(job.provider.ensName, townName) ?? job.provider.id,
    amountUsdc: job.amount,
    status: mapJobStatus(job.status),
    createdAtTick: toTick(job.createdAt, anchorSec, tickMs),
    settledAtTick: job.settledAt !== null ? toTick(job.settledAt, anchorSec, tickMs) : null,
    tx: null,
  };
}

export function mapGdpSeriesPoints(
  points: { timestamp: string; gdpUsdc: string }[],
  anchorSec: number,
  tickMs: number,
): GdpPoint[] {
  let cumulative = 0n;
  const sorted = [...points].sort((a, b) => {
    const da = BigInt(a.timestamp);
    const db = BigInt(b.timestamp);
    return da < db ? -1 : da > db ? 1 : 0;
  });
  return sorted.map((point) => {
    cumulative += BigInt(point.gdpUsdc);
    return {
      tick: toTick(point.timestamp, anchorSec, tickMs),
      gdpUsdc: cumulative.toString(),
    };
  });
}

export function buildGdpSeries(
  payments: { amount: string; timestamp: string }[],
  anchorSec: number,
  tickMs: number,
): GdpPoint[] {
  const sorted = [...payments].sort((a, b) => {
    const da = BigInt(a.timestamp);
    const db = BigInt(b.timestamp);
    return da < db ? -1 : da > db ? 1 : 0;
  });
  let cumulative = 0n;
  const byTick = new Map<number, bigint>();
  for (const payment of sorted) {
    cumulative += BigInt(payment.amount);
    const tick = toTick(payment.timestamp, anchorSec, tickMs);
    byTick.set(tick, cumulative);
  }
  return [...byTick.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tick, gdpUsdc]) => ({ tick, gdpUsdc: gdpUsdc.toString() }));
}
