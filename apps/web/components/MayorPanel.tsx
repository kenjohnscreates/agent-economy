"use client";
// M5.7 mayor panel: the one human click in the demo (PRD §8). Fund the treasury, approve
// or deny flagged loans, set the base rate. Every action is one of the three frozen POSTs
// in lib/api.ts; every result is a toast with the arcscan link, or the error text. Replay
// mode never POSTs. Nothing here invents a tx: a 501 from real mode is shown as an error.
import { useEffect, useState, type FormEvent } from "react";
import { Check, Coins, Percent, X } from "lucide-react";
import {
  BASE_RATE_MAX_BPS,
  BASE_RATE_MIN_BPS,
  type Loan,
  type ScoreboardResponse,
} from "@agent-town/shared";
import { api } from "@/lib/api";
import { formatBps, formatUsdc } from "@/lib/usdc";
import { RATE_STEP_BPS, errorToast, fundBody, snapBps, txToast } from "@/lib/mayor";
import { Toasts, useToasts } from "./Toasts";

export function MayorPanel({
  pendingLoans,
  scoreboard,
  mode,
  onLoansChanged,
}: {
  pendingLoans: Loan[];
  scoreboard: ScoreboardResponse | null;
  mode: "live" | "replay";
  /** Called after a loan decision lands so the queue refetches before the next tick. */
  onLoansChanged: () => void;
}) {
  const { toasts, push, dismiss } = useToasts();
  const [busy, setBusy] = useState<string | null>(null);
  const [amount, setAmount] = useState("1");
  const [bps, setBps] = useState<number>(BASE_RATE_MIN_BPS);
  const [touched, setTouched] = useState(false);
  const readOnly = mode === "replay";

  // Seed the slider from the scoreboard until the mayor moves it.
  const seed = scoreboard?.rate.baseRateBps;
  useEffect(() => {
    if (!touched && seed != null) setBps(snapBps(seed));
  }, [seed, touched]);

  async function run(
    key: string,
    kind: string,
    call: () => Promise<{ txHash: string; explorerUrl: string }>,
  ) {
    if (readOnly) {
      push({
        tone: "error",
        title: "Replay is read-only",
        detail: "Switch to live to send mayor transactions.",
      });
      return false;
    }
    setBusy(key);
    try {
      const res = await call();
      push(txToast(kind, res));
      return true;
    } catch (err) {
      push(errorToast(kind, err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function onFund(e: FormEvent) {
    e.preventDefault();
    let body;
    try {
      body = fundBody(amount);
    } catch (err) {
      push(errorToast("Fund", err));
      return;
    }
    await run("fund", `Fund ${formatUsdc(body.amountUsdc)} USDC`, () => api.mayorFund(body));
  }

  async function onDecide(loan: Loan, approve: boolean) {
    const kind = `${approve ? "Approve" : "Deny"} ${loan.id}`;
    const ok = await run(`loan:${loan.id}`, kind, () =>
      api.mayorLoanDecision({ loanId: loan.id, approve }),
    );
    if (ok) onLoansChanged();
  }

  async function onRate(e: FormEvent) {
    e.preventDefault();
    const value = snapBps(bps);
    await run("rate", `Rate ${formatBps(value)}`, () => api.mayorRate({ bps: value }));
  }

  return (
    <section className="card mayor" aria-label="Mayor">
      <div className="card-title">
        <span className="h3">Mayor</span>
        <span className="label">{readOnly ? "replay · read-only" : "your call"}</span>
      </div>

      <form className="field" onSubmit={onFund} aria-label="Fund treasury">
        <label className="label" htmlFor="mayor-fund">
          Fund treasury (USDC)
        </label>
        <div className="field-row">
          <input
            id="mayor-fund"
            className="input mono"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1.00"
            disabled={readOnly || busy === "fund"}
          />
          <button type="submit" className="btn primary" disabled={readOnly || busy === "fund"}>
            <Coins size={12} aria-hidden="true" /> {busy === "fund" ? "sending" : "fund"}
          </button>
        </div>
      </form>

      <div className="label" style={{ marginTop: 14, marginBottom: 6 }}>
        Loan queue · {pendingLoans.length} flagged
      </div>
      {pendingLoans.length === 0 ? (
        <div className="empty">No flagged loans.</div>
      ) : (
        <ul className="loans queue">
          {pendingLoans.map((l) => {
            const inflight = busy === `loan:${l.id}`;
            return (
              <li className="loan" key={l.id} data-status={l.status}>
                <div className="loan-head">
                  <span className="name">
                    {l.id} · {l.borrower}
                  </span>
                  <span className="mono">{formatUsdc(l.principalUsdc)} USDC</span>
                  <span className="chip" data-status="pending">
                    round {l.requestedAtTick}
                  </span>
                </div>
                {l.advisor ? (
                  <p className="advisor">
                    <span className="label">
                      {l.advisor.source === "llm" ? "advisor" : "rules"} · {l.advisor.decision} ·{" "}
                      {Math.round(l.advisor.confidence * 100)}%
                    </span>{" "}
                    {l.advisor.reasoning}
                  </p>
                ) : null}
                <div className="actions">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={readOnly || inflight}
                    onClick={() => onDecide(l, true)}
                  >
                    <Check size={12} aria-hidden="true" /> approve
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={readOnly || inflight}
                    onClick={() => onDecide(l, false)}
                  >
                    <X size={12} aria-hidden="true" /> deny
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="field"
        onSubmit={onRate}
        aria-label="Set base rate"
        style={{ marginTop: 14 }}
      >
        <label className="label" htmlFor="mayor-rate">
          Base rate · <span className="mono">{formatBps(bps)}</span>
          {seed != null && snapBps(seed) !== bps ? ` (now ${formatBps(seed)})` : ""}
        </label>
        <div className="field-row">
          <input
            id="mayor-rate"
            type="range"
            className="range"
            min={BASE_RATE_MIN_BPS}
            max={BASE_RATE_MAX_BPS}
            step={RATE_STEP_BPS}
            value={bps}
            onChange={(e) => {
              setTouched(true);
              setBps(snapBps(Number(e.target.value)));
            }}
            disabled={readOnly || busy === "rate"}
            aria-valuetext={formatBps(bps)}
          />
          <button type="submit" className="btn primary" disabled={readOnly || busy === "rate"}>
            <Percent size={12} aria-hidden="true" /> {busy === "rate" ? "sending" : "set rate"}
          </button>
        </div>
        <div className="small" style={{ color: "var(--text-muted)", marginTop: 4 }}>
          {formatBps(BASE_RATE_MIN_BPS, 0)} to {formatBps(BASE_RATE_MAX_BPS, 0)} in 0.10% steps. The
          treasurer keeps this as a spread over the market rate.
        </div>
      </form>

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </section>
  );
}
