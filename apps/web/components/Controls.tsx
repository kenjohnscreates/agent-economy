"use client";
import { Pause, Play, Radio, Film } from "lucide-react";
import type { StreamStatus } from "@/lib/store";

const SPEEDS = [0.5, 1, 2, 4, 8];

export function Controls(props: {
  mode: "live" | "replay";
  onMode: (m: "live" | "replay") => void;
  status: StreamStatus;
  paused: boolean;
  speed: number;
  onPause: () => void;
  onResume: () => void;
  onSpeed: (x: number) => void;
}) {
  const { mode, onMode, status, paused, speed, onPause, onResume, onSpeed } = props;
  return (
    <div className="controls" role="group" aria-label="Stream controls">
      <span className="badge" data-status={status}>
        <span className="dot" />
        {status}
      </span>
      <button className="btn" aria-pressed={mode === "live"} onClick={() => onMode("live")}>
        <Radio size={12} aria-hidden="true" /> live
      </button>
      <button className="btn" aria-pressed={mode === "replay"} onClick={() => onMode("replay")}>
        <Film size={12} aria-hidden="true" /> replay
      </button>
      <button
        className="btn"
        onClick={paused ? onResume : onPause}
        aria-label={paused ? "Play" : "Pause"}
      >
        {paused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
        {paused ? "play" : "pause"}
      </button>
      <select
        className="btn"
        value={speed}
        onChange={(e) => onSpeed(Number(e.target.value))}
        aria-label="Replay speed"
        disabled={mode === "live"}
      >
        {SPEEDS.map((x) => (
          <option key={x} value={x}>
            {x}x
          </option>
        ))}
      </select>
    </div>
  );
}
