// Town state + reducer. One object the whole UI reads from; every stream event
// updates it. Pure function so it is testable and replayable.
// Sources of truth: `/agents` snapshots for balances + positions (refetched per
// tick in live mode, recorded per tick in replay mode); `scoreboard` events for
// the numbers; `tx`/`narration`/`loan_flagged` for the feed, bubbles and queue.
import type {
  AgentSummary,
  AgentsResponse,
  Loan,
  ScoreboardResponse,
  SseEvent,
  StorylinePhase,
  TxEvent,
} from "@agent-town/shared";
import { upsertLoan } from "./rate";

export type StreamStatus = "idle" | "connecting" | "live" | "replay" | "reconnecting" | "error";

/** Everything the reducer accepts: SSE events plus two snapshot actions. */
export type TownAction =
  | SseEvent
  | { event: "agents"; data: AgentsResponse }
  | { event: "loans"; data: Loan[] }
  | { event: "status"; data: StreamStatus };

export interface FeedItem {
  id: number;
  receivedAt: number;
  event: SseEvent;
}

export interface TownState {
  tick: number;
  phase: StorylinePhase;
  agents: Record<string, AgentSummary>;
  /** Roster order, so the grid is stable. */
  order: string[];
  scoreboard: ScoreboardResponse | null;
  /** Every loan the API knows about (all statuses); the bank panel's loan book. */
  loans: Loan[];
  /** Flagged loans waiting on the mayor; derived from `loans` plus `loan_flagged` events. */
  pendingLoans: Loan[];
  feed: FeedItem[];
  lastTx: TxEvent | null;
  status: StreamStatus;
  seq: number;
}

export const FEED_CAP = 200;

export function initialState(): TownState {
  return {
    tick: 0,
    phase: "boom",
    agents: {},
    order: [],
    scoreboard: null,
    loans: [],
    pendingLoans: [],
    feed: [],
    lastTx: null,
    status: "idle",
    seq: 0,
  };
}

function pushFeed(s: TownState, event: SseEvent): Pick<TownState, "feed" | "seq"> {
  const item: FeedItem = { id: s.seq + 1, receivedAt: Date.now(), event };
  const feed = s.feed.length >= FEED_CAP ? [...s.feed.slice(1), item] : [...s.feed, item];
  return { feed, seq: s.seq + 1 };
}

export function reduce(s: TownState, a: TownAction): TownState {
  switch (a.event) {
    case "status":
      return { ...s, status: a.data };
    case "agents": {
      const agents: Record<string, AgentSummary> = {};
      const order: string[] = [];
      for (const ag of a.data) {
        // keep the freshest narration if the snapshot has none
        const prev = s.agents[ag.name];
        agents[ag.name] =
          ag.narration == null && prev?.narration ? { ...ag, narration: prev.narration } : ag;
        order.push(ag.name);
      }
      return { ...s, agents, order };
    }
    case "loans":
      return { ...s, loans: a.data, pendingLoans: a.data.filter((l) => l.status === "pending") };
    case "tick":
      return { ...s, tick: a.data.tick, phase: a.data.phase, ...pushFeed(s, a) };
    case "tx":
      return { ...s, lastTx: a.data, ...pushFeed(s, a) };
    case "narration": {
      const ag = s.agents[a.data.agent];
      const agents = ag
        ? { ...s.agents, [a.data.agent]: { ...ag, narration: a.data.text } }
        : s.agents;
      return { ...s, agents, ...pushFeed(s, a) };
    }
    case "loan_flagged": {
      const others = s.pendingLoans.filter((l) => l.id !== a.data.id);
      return {
        ...s,
        loans: upsertLoan(s.loans, a.data),
        pendingLoans: [...others, a.data],
        ...pushFeed(s, a),
      };
    }
    case "scoreboard":
      return { ...s, scoreboard: a.data, tick: Math.max(s.tick, a.data.ticks) };
  }
}
