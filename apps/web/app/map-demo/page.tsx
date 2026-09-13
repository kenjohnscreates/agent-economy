"use client";
// Fixture-only replay of the exact events and snapshots shipped with the app.
// Each event commits separately so adjacent transactions are visible to MapSlot.
// Playback time is owned here; the map itself only consumes props.
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import fixture from "../../fixtures/replay.json";
import { MapSlot } from "../../components/MapSlot";
import { openReplay, ReplayFileSchema, type ReplayControls } from "../../lib/replay";
import { initialState, reduce } from "../../lib/store";
import { IntroBoundary } from "../../components/intro/IntroBoundary";

const recording = ReplayFileSchema.parse(fixture);

export default function MapDemo() {
  return (
    <IntroBoundary>
      <MapDemoContent />
    </IntroBoundary>
  );
}

function MapDemoContent() {
  const [state, setState] = useState(initialState);
  const [selected, setSelected] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [restart, setRestart] = useState(0);
  const player = useRef<ReplayControls | null>(null);
  const speedRef = useRef(1);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  useEffect(() => {
    player.current = openReplay(
      recording,
      (event) => {
        flushSync(() => setState((previous) => reduce(previous, event)));
      },
      { speed: speedRef.current },
    );
    return () => {
      player.current?.close();
      player.current = null;
    };
  }, [restart]);
  return (
    <main className="map-demo">
      <header className="demo-toolbar">
        <div>
          <div className="label">BOTANICA / TOWN REPLAY</div>
          <h1>Agents grow the economy.</h1>
        </div>
        <div className="demo-controls">
          <span className="label" aria-live="polite">
            Round {state.tick} · {state.phase}
          </span>
          <button
            type="button"
            onClick={() => {
              if (paused) player.current?.resume();
              else player.current?.pause();
              setPaused(!paused);
            }}
          >
            {paused ? "Play" : "Pause"}
          </button>
          <label>
            Speed{" "}
            <select
              aria-label="Replay speed"
              value={speed}
              onChange={(e) => {
                const value = Number(e.target.value);
                setSpeed(value);
                speedRef.current = value;
                player.current?.setSpeed(value);
              }}
            >
              {[0.25, 0.5, 1, 2, 4, 8].map((value) => (
                <option key={value} value={value}>
                  {value}x
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              player.current?.close();
              setState(initialState());
              setSelected(null);
              setPaused(false);
              setRestart((value) => value + 1);
            }}
          >
            Restart
          </button>
        </div>
      </header>
      <section className="demo-world" aria-label="Recorded town">
        <MapSlot
          agents={state.order.map((name) => state.agents[name]!).filter(Boolean)}
          lastTx={state.lastTx}
          tick={state.tick}
          phase={state.phase}
          selected={selected}
          onSelectAgent={setSelected}
          reducedMotion={reduced}
        />
      </section>
      <footer>
        <span>Plant · Build · Coordinate · Compound</span>
        <span>
          {reduced ? "Reduced motion" : "Arrow keys to explore"} · Enter to select · Esc to clear
        </span>
      </footer>
      <style>{`
      .map-demo { height:100dvh; min-height:480px; padding:20px 28px 16px; display:flex; flex-direction:column; gap:16px; background:#0B2E1B; color:#D9F0C6; }
      .demo-toolbar { display:flex; align-items:center; justify-content:space-between; gap:24px; }
      .demo-toolbar h1 { margin:4px 0 0; font-size:24px; font-weight:500; letter-spacing:-.6px; }
      .demo-controls { display:flex; gap:12px; align-items:center; }
      .demo-controls button,.demo-controls select { background:#166534; color:#D9F0C6; border:1px solid #7CB342; padding:8px 12px; border-radius:6px; font:inherit; cursor:pointer; }
      .demo-controls label { display:flex; align-items:center; gap:8px; font-size:13px; }
      .demo-world { flex:1; min-height:360px; position:relative; border:1px solid #166534; border-radius:14px; overflow:hidden; }
      .map-demo footer { display:flex; justify-content:space-between; gap:16px; font-size:12px; }
      @media(max-width:900px) { .demo-toolbar{align-items:flex-start;flex-direction:column;gap:12px;} .map-demo{padding:16px;} .demo-toolbar h1{font-size:20px;} .map-demo footer{flex-wrap:wrap;} }
    `}</style>
    </main>
  );
}
