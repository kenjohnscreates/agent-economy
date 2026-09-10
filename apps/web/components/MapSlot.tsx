"use client";
// Mount point for the overworld map (card M5.2, built by Astra per docs/ASTRA-MAP-BRIEF.md).
// The props contract and coordinates remain frozen. TownMap owns rendering only.
import type { AgentSummary, Building, StorylinePhase, TxEvent } from "@agent-town/shared";
import { TownMap } from "./map/TownMap";

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
  return <TownMap {...p} />;
}
