"use client";
// App shell (M5.1, M5.8, M5.10, M5.14): the town is the screen. Map is full-width;
// scoreboard / bank / mayor live in a Town data drawer; feed is a glass rail; visitor
// opens from the white header button. Replay loads fixtures/replay.json.
import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, PanelRight, UserPlus } from "lucide-react";
import { AGENT_NAMES, ROSTER, VISITOR_STORAGE_KEY } from "@agent-town/shared";
import { Drawer } from "./Drawer";
import { useTown, type TownSource } from "@/lib/useTown";
import type { ConnectPhase } from "@/lib/connect";
import { ReplayFileSchema, type ReplayFile } from "@/lib/replay";
import { API_URL } from "@/lib/config";
import { Controls } from "./Controls";
import { Scoreboard } from "./Scoreboard";
import { BankPanel } from "./BankPanel";
import { MayorPanel } from "./MayorPanel";
import { Feed } from "./Feed";
import { AgentCard } from "./AgentCard";
import { MapSlot } from "./MapSlot";
import { VisitorPanel } from "./VisitorPanel";
import { Wordmark } from "./Wordmark";

type Mode = "live" | "replay";

const CONNECT_TITLES: Record<ConnectPhase, string> = {
  warming: "Town API is warming up",
  unreachable: "Cannot reach the town API",
  failed: "Town API error",
  "stream-dropped": "Live stream dropped",
  "stream-closed": "Live stream closed",
};

type Tab = "town" | "agents";
type DrawerId = "data" | "agent";

export function Shell() {
  const [mode, setMode] = useState<Mode>("live");
  const [replay, setReplay] = useState<ReplayFile | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [tab, setTab] = useState<Tab>("town");
  const [drawer, setDrawer] = useState<DrawerId | null>(null);
  const panelsBtn = useRef<HTMLButtonElement>(null);
  const agentBtn = useRef<HTMLButtonElement>(null);

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

  const { state, controls, error, info, health, speed, paused } = useTown(source);
  const [myVisitor, setMyVisitor] = useState<string | null>(null);

  useEffect(() => {
    try {
      setMyVisitor(localStorage.getItem(VISITOR_STORAGE_KEY));
    } catch {
      setMyVisitor(null);
    }
  }, []);

  function rememberVisitor() {
    try {
      setMyVisitor(localStorage.getItem(VISITOR_STORAGE_KEY));
    } catch {
      /* ignore */
    }
    controls.refreshAgents();
  }

  const agents = state.order
    .map((n) => state.agents[n]!)
    .filter(Boolean)
    .filter(
      (a) =>
        (AGENT_NAMES as readonly string[]).includes(a.name) || a.name === myVisitor,
    );
  const mapAgents = agents.filter((a) => (AGENT_NAMES as readonly string[]).includes(a.name));
  const visitorName =
    agents.find((a) => !(AGENT_NAMES as readonly string[]).includes(a.name))?.name ?? null;
  const visitorLive = mode === "live" && health?.mode === "real";
  const hasVisitor = Boolean(visitorName ?? myVisitor);

  return (
    <div className="shell">
      <header className="header">
        <Wordmark />
        <span className="label">
          round {state.tick} · {state.phase}
        </span>

        <div className="tabs" role="tablist" aria-label="View">
          <button
            role="tab"
            id="tab-town"
            aria-selected={tab === "town"}
            aria-controls="panel-town"
            className="tab"
            onClick={() => setTab("town")}
          >
            Town
          </button>
          <button
            role="tab"
            id="tab-agents"
            aria-selected={tab === "agents"}
            aria-controls="panel-agents"
            className="tab"
            onClick={() => setTab("agents")}
          >
            <LayoutGrid size={12} aria-hidden="true" /> Agents
            <span className="tab-count">{agents.length || 8}</span>
          </button>
        </div>
        {mode === "live" ? (
          <span className="hchips" aria-label="API status">
            {health ? (
              <span
                className="hchip"
                data-mode={health.mode}
                title="Which data source the API is serving"
              >
                api · {health.mode}
              </span>
            ) : null}
            {info ? (
              <>
                <span
                  className="hchip"
                  data-on={info.flags.llmAdvisor}
                  title="Treasurer advisor: LLM with rules fallback, or rules only"
                >
                  advisor · {info.flags.llmAdvisor ? "llm" : "rules"}
                </span>
                <span
                  className="hchip"
                  data-on={info.flags.externalSignals}
                  title="Signal C: real market rates from The Graph"
                >
                  signals · {info.flags.externalSignals ? "live" : "off"}
                </span>
                <span className="hchip tickchip" title="Seconds per decision round">
                  {Math.round(info.tickMs / 1000)}s round
                </span>
              </>
            ) : null}
          </span>
        ) : null}
        <span className="spacer" />
        <button
          ref={agentBtn}
          className="btn agent-btn"
          onClick={() => setDrawer("agent")}
          aria-haspopup="dialog"
          aria-expanded={drawer === "agent"}
        >
          <UserPlus size={13} aria-hidden="true" />
          {hasVisitor ? "Your agent" : "Add your agent"}
        </button>
        <button
          ref={panelsBtn}
          className="btn panels-btn"
          onClick={() => setDrawer("data")}
          aria-haspopup="dialog"
          aria-expanded={drawer === "data"}
          aria-label="Town data"
        >
          <PanelRight size={12} aria-hidden="true" />
          <span className="btn-text">Town data</span>
          {state.pendingLoans.length > 0 ? (
            <span className="pip" aria-label={`${state.pendingLoans.length} waiting on the mayor`}>
              {state.pendingLoans.length}
            </span>
          ) : null}
        </button>
        <Controls
          mode={mode}
          onMode={setMode}
          status={state.status}
          paused={paused}
          speed={speed}
          onPause={controls.pause}
          onResume={controls.resume}
          onSpeed={controls.setSpeed}
          onReconnect={controls.reconnect}
        />
      </header>

      <main className="main">
        <section
          className="column"
          role="tabpanel"
          id="panel-town"
          aria-labelledby="tab-town"
          hidden={tab !== "town"}
          aria-label="Town"
        >
          <div className="stage">
            <div className="map-wrap">
              <div className="map-frame">
                <MapSlot
                  agents={mapAgents}
                  lastTx={state.lastTx}
                  tick={state.tick}
                  phase={state.phase}
                  selected={selected}
                  onSelectAgent={setSelected}
                  reducedMotion={reducedMotion}
                />
              </div>
              <div className="statement">
                <div className="h2">Agents grow the economy.</div>
                <div className="label">Plant · Build · Coordinate · Compound</div>
              </div>
            </div>

            <aside className="feedrail" aria-label="Event feed">
              <Feed items={state.feed} pending={state.pendingLoans} />
            </aside>
          </div>

          {error ? (
            <div className="card connect" data-phase={error.phase} role="status">
              <div className="card-title">
                <span className="h3">{CONNECT_TITLES[error.phase]}</span>
                <span className="label">
                  attempt {error.attempt} · {API_URL}
                </span>
              </div>
              <p className="small" style={{ color: "var(--text-muted)", margin: 0 }}>
                {error.text}
              </p>
              {error.phase === "unreachable" ? (
                <pre>{`pnpm --filter @agent-town/api dev:mock          # mock, no chain
API_MODE=real pnpm --filter @agent-town/api dev  # real: subgraph + ENS + Arc`}</pre>
              ) : null}
              <div className="actions">
                <button className="btn primary" onClick={controls.reconnect}>
                  retry now
                </button>
                <button className="btn" onClick={() => setMode("replay")}>
                  switch to replay
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section
          className="column"
          role="tabpanel"
          id="panel-agents"
          aria-labelledby="tab-agents"
          hidden={tab !== "agents"}
          aria-label="Agents"
        >
          <div className="agents" data-count={agents.length || 8}>
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
                    you={visitorName === a.name}
                    onSelect={setSelected}
                  />
                ))}
          </div>
        </section>
      </main>

      <Drawer
        open={drawer === "agent"}
        title="Your agent"
        onClose={() => {
          setDrawer(null);
          agentBtn.current?.focus();
        }}
      >
        <VisitorPanel
          enabled={visitorLive}
          visitorName={visitorName ?? myVisitor}
          onChanged={rememberVisitor}
        />
      </Drawer>

      <Drawer
        open={drawer === "data"}
        title="Town data"
        onClose={() => {
          setDrawer(null);
          panelsBtn.current?.focus();
        }}
      >
        <Scoreboard scoreboard={state.scoreboard} reducedMotion={reducedMotion} />
        <BankPanel scoreboard={state.scoreboard} loans={state.loans} tick={state.tick} />
        <MayorPanel
          pendingLoans={state.pendingLoans}
          scoreboard={state.scoreboard}
          mode={mode}
          onLoansChanged={controls.refreshLoans}
        />
      </Drawer>
    </div>
  );
}
