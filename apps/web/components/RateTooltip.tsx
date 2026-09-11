"use client";
// Rate breakdown tooltip (M5.4, PRD §12). Hover, focus or click the town rate to see how
// it stacks on the real anchor, which lending subgraph the anchor came from, the raw
// market APY, when it was fetched, and a STALE badge when the last fetch failed.
// Mouse, keyboard (focus opens, Escape closes) and screen readers (aria-describedby
// points at the tooltip content, which is read even while hidden) all work.
//
// M5.13: hover and focus used to write the same single flag and click toggled it, so a
// click landed after hover had already opened the panel and immediately closed it again.
// The result depended on the order of mouseenter, focus and click, which is why it felt
// random. The pointer and the keyboard now keep their own flag, and click only ever opens.
// Open stays an explicit decision rather than something derived from those flags, so
// Escape can close the panel while the trigger is still hovered and still focused.
import { useId, useRef, useState } from "react";
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
  // Which input is on the trigger right now. Read inside handlers, never rendered.
  const hovering = useRef(false);
  const focusing = useRef(false);
  const { rows, clamped } = rateStack(rate);
  return (
    <span
      className="tip"
      onMouseEnter={() => {
        hovering.current = true;
        setOpen(true);
      }}
      onMouseLeave={() => {
        hovering.current = false;
        // A keyboard user who happens to move the mouse away keeps their tooltip.
        if (!focusing.current) setOpen(false);
      }}
    >
      <button
        type="button"
        className="tip-trigger"
        aria-describedby={id}
        aria-expanded={open}
        aria-label={`Town rate ${formatBps(rate.townRateBps)}, show how it is priced`}
        onFocus={() => {
          focusing.current = true;
          setOpen(true);
        }}
        onBlur={() => {
          focusing.current = false;
          if (!hovering.current) setOpen(false);
        }}
        // Click, Enter and Space all mean "show me this", never "hide it again". The panel
        // is already open under the pointer by the time a click lands, so a toggle could
        // only ever close it. Escape, blur and moving away are how it closes.
        onClick={() => setOpen(true)}
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
