"use client";
// M5.4 bank panel: the treasury as the mayor sees it. Balance, utilisation, base rate and
// town rate (with the rate breakdown tooltip and STALE badge from /scoreboard.signals),
// then the loan book with the advisor's reasoning on each decision. Reads the reducer only.
import { useEffect, useState } from "react";
import type { Loan, ScoreboardResponse } from "@agent-town/shared";
import { formatBps, formatUsdc } from "@/lib/usdc";
import { groupLoans, latestVerdict, utilisationTone, type Tone } from "@/lib/rate";
import { TOWN_NAME } from "@/lib/config";
import { RateTooltip } from "./RateTooltip";
import { StaleBadge } from "./StaleBadge";

/** Wall clock that re-renders every `everyMs` so "fetched 12s ago" keeps moving. */
function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

function Tile({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <div className="stat-tile" data-tone={tone}>
      <div className="label">{label}</div>
      <div className="stat">{children}</div>
    </div>
  );
}

function loanTiming(loan: Loan): string {
  const parts: string[] = [];
  if (loan.status === "pending") {
    parts.push(`requested tick ${loan.requestedAtTick}`, "waiting on the mayor");
  } else if (loan.approvedAtTick != null) {
    parts.push(`approved tick ${loan.approvedAtTick}`);
  } else {
    parts.push(`requested tick ${loan.requestedAtTick}`);
  }
  if (loan.dueAtTick != null && loan.status === "approved") parts.push(`due tick ${loan.dueAtTick}`);
  if (loan.defaultedAtTick != null) parts.push(`defaulted tick ${loan.defaultedAtTick}`);
  if (BigInt(loan.repaidUsdc) > 0n) parts.push(`repaid ${formatUsdc(loan.repaidUsdc)}`);
  return parts.join(" · ");
}

function LoanRow({ loan, tick }: { loan: Loan; tick: number }) {
  const overdue = loan.status === "approved" && loan.dueAtTick != null && tick > loan.dueAtTick;
  return (
    <li className="loan" data-status={loan.status}>
      <div className="loan-head">
        <span className="name">
          {loan.id} · {loan.borrower}
        </span>
        <span className="mono">
          {formatUsdc(loan.principalUsdc)} USDC at {formatBps(loan.rateBps)}
        </span>
        <span className="chip" data-status={loan.status}>
          {loan.status}
          {overdue ? " · overdue" : ""}
        </span>
      </div>
      <div className="label">{loanTiming(loan)}</div>
      {loan.advisor ? (
        <p className="advisor">
          <span className="label">
            {loan.advisor.source === "llm" ? "advisor" : "rules"} · {loan.advisor.decision} ·{" "}
            {Math.round(loan.advisor.confidence * 100)}%
          </span>{" "}
          {loan.advisor.reasoning}
        </p>
      ) : null}
    </li>
  );
}

const MAX_ROWS = 6;

export function BankPanel({
  scoreboard,
  loans,
  tick,
}: {
  scoreboard: ScoreboardResponse | null;
  loans: Loan[];
  tick: number;
}) {
  const now = useNow(10_000);
  if (!scoreboard) {
    return (
      <section className="card bank" aria-label="Bank" aria-busy="true">
        <div className="card-title">
          <span className="h3">Bank</span>
          <span className="label">waiting for scoreboard</span>
        </div>
        <div className="empty">The treasury reports on the first tick.</div>
      </section>
    );
  }
  const s = scoreboard;
  const book = groupLoans(loans);
  const latest = latestVerdict(loans);
  const shown = [...book.pending, ...book.open, ...book.closed].slice(0, MAX_ROWS);
  const hidden = loans.length - shown.length;
  return (
    <section className="card bank" aria-label="Bank">
      <div className="card-title">
        <span className="h3">Bank</span>
        <span className="label bank-name">
          bank.{TOWN_NAME}.eth
          {s.signals.stale ? <StaleBadge /> : null}
        </span>
      </div>
      <div className="stats">
        <Tile label="Treasury">{formatUsdc(s.treasuryBalanceUsdc)}</Tile>
        <Tile label="Utilisation" tone={utilisationTone(s.rate.utilisationBps)}>
          {formatBps(s.rate.utilisationBps)}
        </Tile>
        <Tile label="Base rate">{formatBps(s.rate.baseRateBps)}</Tile>
        <Tile label="Town rate">
          <RateTooltip rate={s.rate} signals={s.signals} nowMs={now} />
        </Tile>
        <Tile label={`Loans out · ${s.loansOutstanding}`}>{formatUsdc(s.outstandingUsdc)}</Tile>
        <Tile label="Default rate" tone={s.defaults > 0 ? "warn" : undefined}>
          {formatBps(s.defaultRateBps)}
        </Tile>
      </div>
      {latest?.advisor ? (
        <div className="decision">
          <div className="label">
            Latest decision · {latest.id} · {latest.advisor.source === "llm" ? "advisor" : "rules"}
          </div>
          <p>“{latest.advisor.reasoning}”</p>
        </div>
      ) : null}
      <div className="label" style={{ marginTop: 14, marginBottom: 6 }}>
        Loan book · {book.pending.length} pending · {book.open.length} open · {book.closed.length}{" "}
        closed
      </div>
      {loans.length === 0 ? (
        <div className="empty">No loans on the books yet. Replay recordings carry flagged loans only.</div>
      ) : (
        <ul className="loans">
          {shown.map((l) => (
            <LoanRow key={l.id} loan={l} tick={tick} />
          ))}
        </ul>
      )}
      {hidden > 0 ? (
        <div className="label" style={{ marginTop: 6 }}>
          +{hidden} more
        </div>
      ) : null}
    </section>
  );
}
