// Realistic fixtures — one per response schema — imported by the M0.7 mock
// server (`apps/api --mock`) and by FE tests. Snapshot: tick 7, phase 'default'
// (PRD §12: a worker just defaulted, treasurer hiked the rate).
// Inputs: none. Outputs: `FIXTURES` + named exports; every value is validated in
// fixtures.test.ts against its schema. Town label uses TOWN_NAME_PLACEHOLDER.
import {
  type AgentDetailResponse,
  type AgentsResponse,
  type ApiError,
  type Job,
  type Loan,
  type RateBreakdown,
  type ScoreboardResponse,
  type Signals,
  type StateResponse,
  type TxResponse,
} from "./api.js";
import { ARC_EXPLORER_URL } from "./constants.js";
import { type NarrationEvent, type SseEvent, type TickEvent, type TxEvent } from "./events.js";
import { type AgentName, ROSTER, TOWN_NAME_PLACEHOLDER, ensNameFor } from "./roster.js";

export const FIXTURE_TICK = 7 as const;
const TOWN = TOWN_NAME_PLACEHOLDER;

/** Deterministic fake Arc addresses, one per roster slot (index 1–8). */
const ADDRESSES: Record<AgentName, `0x${string}`> = {
  ada: "0x1000000000000000000000000000000000000ada",
  bo: "0x20000000000000000000000000000000000000b0",
  cy: "0x30000000000000000000000000000000000000c1",
  dee: "0x4000000000000000000000000000000000000dee",
  eli: "0x5000000000000000000000000000000000000e11",
  fay: "0x6000000000000000000000000000000000000fa1",
  gus: "0x7000000000000000000000000000000000000605",
  hal: "0x8000000000000000000000000000000000000a11",
};

const TX_1 = "0x1111111111111111111111111111111111111111111111111111111111111111";
const TX_2 = "0x2222222222222222222222222222222222222222222222222222222222222222";
const TX_3 = "0x3333333333333333333333333333333333333333333333333333333333333333";

export const stateFixture: StateResponse = {
  tick: FIXTURE_TICK,
  phase: "default",
  flags: { llmAdvisor: true, llmNarrator: true, externalSignals: true, storyline: "demo" },
  tickMs: 15_000,
  maxTicks: 50,
  startedAt: "2026-09-08T18:00:00.000Z",
};

type AgentOverrides = Pick<
  AgentsResponse[number],
  "balanceUsdc" | "creditScore" | "position" | "lastDecision" | "narration"
>;

function agent(name: AgentName, o: AgentOverrides): AgentsResponse[number] {
  const r = ROSTER.find((e) => e.name === name);
  if (!r) throw new Error(`fixture: unknown agent ${name}`);
  return {
    name,
    ensName: ensNameFor(name, TOWN),
    role: r.role,
    arcAddress: ADDRESSES[name],
    avatar: r.avatar,
    ...o,
  };
}

export const agentsFixture: AgentsResponse = [
  agent("ada", {
    balanceUsdc: "42500000",
    creditScore: null,
    position: { building: "bank", x: 0.5, y: 0.55 },
    lastDecision: {
      tick: 7,
      kind: "mark_default",
      summary: "Marked fay's loan L-2 defaulted; town rate → 8.1%",
    },
    narration: "Grace period is over. Rates go up until the books balance.",
  }),
  agent("bo", {
    balanceUsdc: "6100000",
    creditScore: 78,
    position: { building: "market", x: 0.4, y: 0.5 },
    lastDecision: { tick: 7, kind: "post_job", summary: "Posted job J-2 for 1.2 USDC" },
    narration: "Shelves are thin again — hiring!",
  }),
  agent("cy", {
    balanceUsdc: "3900000",
    creditScore: 71,
    position: { building: "market", x: 0.62, y: 0.48 },
    lastDecision: { tick: 6, kind: "idle", summary: "Inventory 3 ≥ 2; waiting for buyers" },
    narration: "DEX volume is up, nudging prices a touch.",
  }),
  agent("dee", {
    balanceUsdc: "2200000",
    creditScore: 82,
    position: { building: "workshop", x: 0.3, y: 0.6 },
    lastDecision: { tick: 7, kind: "deposit", summary: "Deposited 0.24 USDC (20% of J-1 pay)" },
    narration: "Another job done, another coin in the bank.",
  }),
  agent("eli", {
    balanceUsdc: "1750000",
    creditScore: 74,
    position: { building: "workshop", x: 0.55, y: 0.45 },
    lastDecision: { tick: 7, kind: "accept_job", summary: "Accepted J-2 (highest pay open)" },
    narration: "Best-paying job on the board — mine.",
  }),
  agent("fay", {
    balanceUsdc: "150000",
    creditScore: 35,
    position: { building: "homes", x: 0.7, y: 0.7 },
    lastDecision: { tick: 7, kind: "idle", summary: "Loan L-2 defaulted; no open jobs accepted" },
    narration: "…maybe I should have paid that back.",
  }),
  agent("gus", {
    balanceUsdc: "2600000",
    creditScore: 70,
    position: { building: "market", x: 0.45, y: 0.7 },
    lastDecision: { tick: 7, kind: "buy", summary: "Bought 1 good from bo for 0.53 USDC" },
    narration: "Prices are a bit steeper today, still worth it.",
  }),
  agent("hal", {
    balanceUsdc: "900000",
    creditScore: 70,
    position: { building: "homes", x: 0.25, y: 0.75 },
    lastDecision: { tick: 6, kind: "pay_stipend", summary: "Received 0.5 USDC stipend" },
    narration: "Waiting for next stipend before shopping.",
  }),
];

export const loansFixture: Loan[] = [
  {
    id: "L-1",
    borrower: "bo",
    principalUsdc: "3000000",
    rateBps: 610,
    status: "approved",
    requestedAtTick: 4,
    approvedAtTick: 4,
    repaidUsdc: "0",
    defaultedAtTick: null,
    advisor: {
      decision: "approve",
      reasoning:
        "Utilisation 22%, score 78, two prior loans repaid on time; market rate 4.1%, our rate 6.1%.",
      confidence: 0.86,
      source: "llm",
    },
  },
  {
    id: "L-2",
    borrower: "fay",
    principalUsdc: "1000000",
    rateBps: 610,
    status: "defaulted",
    requestedAtTick: 3,
    approvedAtTick: 3,
    repaidUsdc: "0",
    defaultedAtTick: 7,
    advisor: {
      decision: "approve",
      reasoning: "Score 70 ≥ 60 and utilisation 15% < 80%.",
      confidence: 1,
      source: "rules",
    },
  },
];

export const jobsFixture: Job[] = [
  {
    id: "J-1",
    client: "bo",
    provider: "dee",
    amountUsdc: "1200000",
    status: "completed",
    createdAtTick: 2,
    settledAtTick: 3,
    tx: TX_1,
  },
  {
    id: "J-2",
    client: "bo",
    provider: "eli",
    amountUsdc: "1200000",
    status: "funded",
    createdAtTick: 7,
    settledAtTick: null,
    tx: TX_2,
  },
];

export const signalsFixture: Signals = {
  usdcBorrowApyBps: 410,
  dexVolume24hUsd: "184532211.55",
  fetchedAt: "2026-09-08T18:01:45.000Z",
  stale: false,
  sources: {
    lending: { subgraphId: "EXT_LENDING_SUBGRAPH_ID", name: "Aave V3 Ethereum (Messari lending)" },
    dex: { subgraphId: "EXT_DEX_SUBGRAPH_ID", name: "Uniswap V3 Ethereum (Messari DEX)" },
  },
};

export const rateFixture: RateBreakdown = {
  marketApyBps: 410,
  spreadBps: 200,
  defaultPremiumBps: 200,
  utilisationBps: 2400,
  baseRateBps: 610,
  townRateBps: 810,
};

export const scoreboardFixture: ScoreboardResponse = {
  gdpUsdc: "9870000",
  treasuryBalanceUsdc: "42500000",
  outstandingUsdc: "4000000",
  defaultRateBps: 5000,
  baseRateBps: 610,
  ticks: FIXTURE_TICK,
  jobsCompleted: 3,
  loansOutstanding: 2,
  gdpSeries: [
    { tick: 1, gdpUsdc: "1060000" },
    { tick: 2, gdpUsdc: "2260000" },
    { tick: 3, gdpUsdc: "4520000" },
    { tick: 4, gdpUsdc: "5590000" },
    { tick: 5, gdpUsdc: "7250000" },
    { tick: 6, gdpUsdc: "8320000" },
    { tick: 7, gdpUsdc: "9870000" },
  ],
  signals: signalsFixture,
  rate: rateFixture,
};

const fay = agentsFixture[5];
if (!fay) throw new Error("fixture: roster slot 5 (fay) missing");

/** GET /agents/fay — the defaulted worker, so reviews + a defaulted loan show. */
export const agentDetailFixture: AgentDetailResponse = {
  ...fay,
  loans: loansFixture.filter((l) => l.borrower === "fay"),
  jobs: [],
  reviews: [{ by: "ada", tick: 7, score: 35, note: "defaulted on 1 USDC, tick 7" }],
  links: {
    arcscan: `${ARC_EXPLORER_URL}/address/${ADDRESSES.fay}`,
    ens: `https://sepolia.app.ens.domains/${ensNameFor("fay", TOWN)}`,
  },
};

export const txResponseFixture: TxResponse = {
  txHash: TX_3,
  explorerUrl: `${ARC_EXPLORER_URL}/tx/${TX_3}`,
};

export const apiErrorFixture: ApiError = { error: "Loan L-9 not found", code: "NOT_FOUND" };

// ── SSE ─────────────────────────────────────────────────────────────────────
export const tickEventFixture: TickEvent = { tick: FIXTURE_TICK, phase: "default" };

export const txEventFixture: TxEvent = {
  tick: FIXTURE_TICK,
  agent: "ada",
  kind: "mark_default",
  txHash: TX_3,
  explorerUrl: `${ARC_EXPLORER_URL}/tx/${TX_3}`,
  status: "complete",
};

export const narrationEventFixture: NarrationEvent = {
  tick: FIXTURE_TICK,
  agent: "ada",
  text: "Grace period is over. Rates go up until the books balance.",
};

const loanFlagged = loansFixture[1];
if (!loanFlagged) throw new Error("fixture: loan L-2 missing");

/** One envelope per SSE event name, in the order a client would see them. */
export const sseEventsFixture: SseEvent[] = [
  { event: "tick", data: tickEventFixture },
  { event: "tx", data: txEventFixture },
  { event: "narration", data: narrationEventFixture },
  { event: "loan_flagged", data: loanFlagged },
  { event: "scoreboard", data: scoreboardFixture },
];

/** Everything in one bag for the mock server. */
export const FIXTURES = {
  state: stateFixture,
  agents: agentsFixture,
  agentDetail: agentDetailFixture,
  loans: loansFixture,
  jobs: jobsFixture,
  signals: signalsFixture,
  rate: rateFixture,
  scoreboard: scoreboardFixture,
  txResponse: txResponseFixture,
  apiError: apiErrorFixture,
  sseEvents: sseEventsFixture,
} as const;
