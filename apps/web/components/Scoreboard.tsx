"use client";
// M5.5 scoreboard: six tiles + GDP sparkline. Data is green (Leaf); nothing else.
import type { ScoreboardResponse } from "@agent-town/shared";
import { formatBps, formatUsdc } from "@/lib/usdc";
import { CountUp } from "./CountUp";

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="stat-tile">
      <div className="label">{label}</div>
      <div className="stat">{children}</div>
    </div>
  );
}

export function Sparkline({
  points,
  width = 360,
  height = 56,
}: {
  points: number[];
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return <div className="empty">GDP series builds as rounds land.</div>;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const d = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(height - ((p - min) / span) * (height - 4) - 2).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label="GDP per round"
    >
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      <circle
        cx={(points.length - 1) * step}
        cy={height - ((points[points.length - 1]! - min) / span) * (height - 4) - 2}
        r="3"
        fill="var(--accent)"
      />
    </svg>
  );
}

export function Scoreboard({
  scoreboard,
  reducedMotion,
}: {
  scoreboard: ScoreboardResponse | null;
  reducedMotion: boolean;
}) {
  if (!scoreboard) {
    return (
      <section className="card" aria-label="Scoreboard" aria-busy="true">
        <div className="card-title">
          <span className="h3">Town</span>
          <span className="label">waiting for scoreboard</span>
        </div>
        <div className="empty">Numbers appear on the first round.</div>
      </section>
    );
  }
  const s = scoreboard;
  const usd = (micro: string) => Number(formatUsdc(micro, 6));
  const fmt2 = (n: number) => n.toFixed(2);
  return (
    <section className="card" aria-label="Scoreboard">
      <div className="card-title">
        <span className="h3">Town</span>
        <span className="label">round {s.ticks}</span>
      </div>
      <div className="stats">
        <Tile label="GDP (USDC)">
          <CountUp value={usd(s.gdpUsdc)} format={fmt2} reducedMotion={reducedMotion} />
        </Tile>
        <Tile label="Treasury">
          <CountUp value={usd(s.treasuryBalanceUsdc)} format={fmt2} reducedMotion={reducedMotion} />
        </Tile>
        <Tile label="Loans out">
          <CountUp value={usd(s.outstandingUsdc)} format={fmt2} reducedMotion={reducedMotion} />
        </Tile>
        <Tile label="Town rate">{formatBps(s.rate.townRateBps)}</Tile>
        <Tile label="Defaults">
          <span className={s.defaults > 0 ? "delta-down" : undefined}>{s.defaults}</span>
        </Tile>
        <Tile label="Jobs done">{s.jobsCompleted}</Tile>
      </div>
      <div style={{ marginTop: 14 }}>
        <div className="label" style={{ marginBottom: 6 }}>
          GDP per round · market {formatBps(s.rate.marketApyBps)} + spread{" "}
          {formatBps(s.rate.spreadBps, 0)}
          {s.signals.stale ? " · stale" : ""}
        </div>
        <Sparkline points={s.gdpSeries.map((p) => usd(p.gdpUsdc))} />
      </div>
    </section>
  );
}
