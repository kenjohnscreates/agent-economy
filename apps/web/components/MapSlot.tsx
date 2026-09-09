"use client";
// Mount point for the overworld map (card M5.2, built by Astra per docs/ASTRA-MAP-BRIEF.md).
// This props contract is frozen; the placeholder below draws the four zones and
// agent positions as an SVG so the data path is visible before the PixiJS layer lands.
import type { AgentSummary, Building, StorylinePhase, TxEvent } from "@agent-town/shared";
import { txDirection } from "@/lib/direction";

export interface MapSlotProps {
  agents: AgentSummary[];
  /** Most recent tx; the map spawns a coin from `txDirection()` when this changes. */
  lastTx: TxEvent | null;
  tick: number;
  phase: StorylinePhase;
  selected: string | null;
  onSelectAgent: (name: string | null) => void;
  reducedMotion: boolean;
}

/** Zone rectangles in a 640x360 native frame (brand book §15 target frame). */
export const ZONES: Record<
  Building | "treasury" | "escrow",
  { x: number; y: number; w: number; h: number; label: string }
> = {
  bank: { x: 240, y: 24, w: 160, h: 120, label: "Treasury" },
  market: { x: 24, y: 150, w: 220, h: 150, label: "Market" },
  workshop: { x: 396, y: 150, w: 220, h: 150, label: "Workshop" },
  homes: { x: 200, y: 260, w: 240, h: 90, label: "Homes" },
  treasury: { x: 240, y: 24, w: 160, h: 120, label: "Treasury" },
  escrow: { x: 396, y: 150, w: 220, h: 150, label: "Workshop" },
};

export function zonePoint(
  building: keyof typeof ZONES,
  x: number,
  y: number,
): { x: number; y: number } {
  const z = ZONES[building];
  return { x: z.x + x * z.w, y: z.y + y * z.h };
}

export function MapSlot(p: MapSlotProps) {
  const dir = p.lastTx ? txDirection(p.lastTx.kind, p.lastTx.agent, p.lastTx.counterparty) : null;
  const locate = (party: string | null) => {
    if (!party) return null;
    const a = p.agents.find((ag) => ag.name === party);
    if (a) return zonePoint(a.position.building, a.position.x, a.position.y);
    if (party in ZONES) return zonePoint(party as keyof typeof ZONES, 0.5, 0.5);
    return null;
  };
  const from = dir ? locate(dir.from) : null;
  const to = dir ? locate(dir.to) : null;

  return (
    <svg
      viewBox="0 0 640 360"
      role="img"
      aria-label={`Town map, tick ${p.tick}, ${p.agents.length} agents, phase ${p.phase}`}
      data-map-placeholder="true"
    >
      <rect width="640" height="360" fill="var(--surface)" />
      {(["bank", "market", "workshop", "homes"] as const).map((b) => {
        const z = ZONES[b];
        return (
          <g key={b}>
            <rect
              x={z.x}
              y={z.y}
              width={z.w}
              height={z.h}
              rx="6"
              fill="var(--bg)"
              stroke="var(--border)"
            />
            <text
              x={z.x + 8}
              y={z.y + 14}
              fontSize="9"
              fontFamily="var(--font-label)"
              fill="var(--text-muted)"
              letterSpacing="1.5"
            >
              {z.label.toUpperCase()}
            </text>
          </g>
        );
      })}
      {from && to ? (
        <line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          opacity="0.8"
        />
      ) : null}
      {p.agents.map((a) => {
        const pt = zonePoint(a.position.building, a.position.x, a.position.y);
        const sel = p.selected === a.name;
        return (
          <g
            key={a.name}
            transform={`translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`}
            style={{
              cursor: "pointer",
              transition: p.reducedMotion ? "none" : "transform 600ms cubic-bezier(.2,0,0,1)",
            }}
            onClick={() => p.onSelectAgent(sel ? null : a.name)}
          >
            <circle
              r={sel ? 8 : 6}
              fill={sel ? "var(--accent)" : "var(--text-muted)"}
              stroke="var(--bg)"
              strokeWidth="2"
            />
            <text
              y="-11"
              textAnchor="middle"
              fontSize="8"
              fontFamily="var(--font-label)"
              fill="var(--text)"
            >
              {a.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
