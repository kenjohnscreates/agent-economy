"use client";
// App shell (M5.1): Forest surface, world window on the left, panels on the right.
// Runs live against the API by default; the replay toggle loads fixtures/replay.json.
import { useEffect, useMemo, useState } from "react";
import { ROSTER } from "@agent-town/shared";
import { useTown, type TownSource } from "@/lib/useTown";
import { ReplayFileSchema, type ReplayFile } from "@/lib/replay";
import { API_URL, TOWN_NAME } from "@/lib/config";
import { Controls } from "./Controls";
import { Scoreboard } from "./Scoreboard";
import { BankPanel } from "./BankPanel";
import { Feed } from "./Feed";
import { AgentCard } from "./AgentCard";
import { MapSlot } from "./MapSlot";
import { Wordmark } from "./Wordmark";

type Mode = "live" | "replay";

export function Shell() {
  const [mode, setMode] = useState<Mode>("live");
  const [replay, setReplay] = useState<ReplayFile | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (mode !== "replay" || replay) return;
    fetch("/replay.json")
      .then((r) => r.json())
      .then((j) => setReplay(ReplayFileSchema.parse(j)))
      .catch((e) =>
        console.error("replay fixture missing; run `pnpm --filter @agent-town/web record`", e),
      );
  }, [mode, replay]);

  const source = useMemo<TownSource | null>(() => {
    if (mode === "live") return { mode: "live" };
    return replay ? { mode: "replay", file: replay } : null;
  }, [mode, replay]);

  const { state, controls, error, speed, paused } = useTown(source);
  const agents = state.order.map((n) => state.agents[n]!).filter(Boolean);

  return (
    <div className="shell">
      <header className="header">
        <Wordmark />
        <span className="label">
          {TOWN_NAME}.eth · tick {state.tick} · {state.phase}
        </span>
        <span className="spacer" />
        <Controls
          mode={mode}
          onMode={setMode}
          status={state.status}
          paused={paused}
          speed={speed}
          onPause={controls.pause}
          onResume={controls.resume}
          onSpeed={controls.setSpeed}
        />
      </header>

      <main className="main">
        <section className="column" aria-label="Town">
          <div className="card world">
            <MapSlot
              agents={agents}
              lastTx={state.lastTx}
              tick={state.tick}
              phase={state.phase}
              selected={selected}
              onSelectAgent={setSelected}
              reducedMotion={reducedMotion}
            />
            <div className="statement">
              <div className="h2">Agents grow the economy.</div>
              <div className="label" style={{ marginTop: 6 }}>
                Plant · Build · Coordinate · Compound
              </div>
            </div>
          </div>

          {error ? (
            <div className="card">
              <div className="h3">Cannot reach the town API</div>
              <p className="small" style={{ color: "var(--text-muted)" }}>
                {error}. Start it with{" "}
                <code className="mono">pnpm --filter @agent-town/api dev:mock</code> on{" "}
                <code className="mono">{API_URL}</code>, or switch to replay.
              </p>
            </div>
          ) : null}

          <div className="agents" aria-label="Agents">
            {agents.length === 0
              ? ROSTER.map((r) => (
                  <div className="agent" key={r.name} aria-busy="true">
                    <div />
                    <div>
                      <div className="name">{r.name}</div>
                      <div className="label">{r.role}</div>
                      <div className="balance">…</div>
                    </div>
                  </div>
                ))
              : agents.map((a) => (
                  <AgentCard
                    key={a.name}
                    agent={a}
                    selected={selected === a.name}
                    onSelect={setSelected}
                  />
                ))}
          </div>
        </section>

        <aside className="column" aria-label="Panels">
          <Scoreboard scoreboard={state.scoreboard} reducedMotion={reducedMotion} />
          <BankPanel scoreboard={state.scoreboard} loans={state.loans} tick={state.tick} />
          <Feed items={state.feed} pending={state.pendingLoans} />
        </aside>
      </main>
    </div>
  );
}
