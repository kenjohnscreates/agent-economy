"use client";
// Rate breakdown tooltip (M5.4, PRD §12). Hover, focus or click the town rate to see how
// it stacks on the real anchor, which lending subgraph the anchor came from, the raw
// market APY, when it was fetched, and a STALE badge when the last fetch failed.
// Mouse, keyboard (focus opens, Escape closes) and screen readers (aria-describedby
// points at the tooltip content, which is read even while hidden) all work.
import { useId, useState } from "react";
import { Info } from "lucide-react";
import type { RateBreakdown, Signals } from "@agent-town/shared";
import { formatBps } from "@/lib/usdc";
import { formatAge, formatUtc, rateStack } from "@/lib/rate";
import { StaleBadge } from "./StaleBadge";

export function RateTooltip({
  rate,
  signals,
  nowMs,
}: {
  rate: RateBreakdown;
  signals: Signals;
  nowMs: number;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const { rows, clamped } = rateStack(rate);
  return (
    <span className="tip" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="tip-trigger"
        aria-describedby={id}
        aria-expanded={open}
        aria-label={`Town rate ${formatBps(rate.townRateBps)}, show how it is priced`}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        {formatBps(rate.townRateBps)}
        <Info size={14} aria-hidden="true" />
      </button>
      <div role="tooltip" id={id} className="tip-panel" hidden={!open}>
        <div className="label">How the town rate is priced</div>
        <ul className="tip-stack">
          {rows.map((r, i) => (
            <li key={r.label}>
              <span>
                {i > 0 ? "+ " : ""}
                {r.label}
              </span>
              <span className="mono">{formatBps(r.bps)}</span>
            </li>
          ))}
          <li className="total">
            <span>= town rate</span>
            <span className="mono">{formatBps(rate.townRateBps)}</span>
          </li>
        </ul>
        <p>
          Base rate {formatBps(rate.baseRateBps)} is market plus spread
          {clamped ? ", clamped to the 1.00% to 20.00% band" : ""}. Utilisation{" "}
          {formatBps(rate.utilisationBps)} gates approvals below 80% and does not move the rate.
        </p>
        <div className="label" style={{ marginTop: 10 }}>
          Source
        </div>
        <p>
          {signals.sources.lending.name}
          <br />
          <span className="mono">{signals.sources.lending.subgraphId}</span>
        </p>
        <p>
          Raw USDC borrow APY {formatBps(signals.usdcBorrowApyBps)}
          <br />
          Fetched {formatUtc(signals.fetchedAt)} ({formatAge(signals.fetchedAt, nowMs)})
        </p>
        {signals.stale ? (
          <p>
            <StaleBadge detail />
          </p>
        ) : null}
      </div>
    </span>
  );
}
