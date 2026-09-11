// Real-mode DataSource tests — mocked graphclient, ENS, Circle (no live txs).
import {
  API_ROUTES,
  AgentsResponseSchema,
  ApiErrorSchema,
  LoansResponseSchema,
  ScoreboardResponseSchema,
  StateResponseSchema,
  TxResponseSchema,
  type SseEvent,
} from "@agent-town/shared";
import type { GraphQLClient } from "graphql-request";
import {
  scoreboard as fetchScoreboard,
  loanHistory,
  gdpSeries,
  fetchExternalSignals,
  rosterJobs,
} from "@agent-town/graphclient";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../routes.js";
import {
  type LedgerAction,
  type LedgerNarration,
  type LedgerReader,
  type TickAnchor,
} from "./ledger.js";
import { RealSource } from "./store.js";

const BO = "0x337512e3f78e9ad91493a98143b511c46c3775f7" as const;
const TX =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as const;

const fakeGraph = {} as GraphQLClient;

const scoreboardDto = {
  treasuryBalanceUsdc: "3000000",
  outstandingUsdc: "1000000",
  baseRateBps: 600,
  jobsCompleted: 2,
  loansOutstanding: 1,
  defaults: 1,
};

const loanRow = {
  id: "2",
  principal: "200000",
  rateBps: 600,
  status: "pending",
  requestedAt: "4",
  approvedAt: null,
  repaid: "0",
  defaultedAt: null,
  borrower: { id: BO, ensName: "bo.botanica.eth" },
};

let mockLoans = [loanRow];

class TestLedger implements LedgerReader {
  tick = 1;
  readonly startedAtFirst = "2026-01-01T00:00:00.000Z";
  actions: LedgerAction[] = [];
  narrations: LedgerNarration[] = [];
  fail = false;

  async getTickAnchor(): Promise<TickAnchor> {
    if (this.fail) throw new Error("Supabase getTickAnchor: Gateway Timeout");
    return { currentTick: this.tick, startedAt: this.startedAtFirst, phase: "boom" };
  }

  async listActions(): Promise<LedgerAction[]> {
    if (this.fail) throw new Error("Supabase listActions: Gateway Timeout");
    return [...this.actions];
  }

  async listNarration(): Promise<LedgerNarration[]> {
    if (this.fail) throw new Error("Supabase listNarration: Gateway Timeout");
    return [...this.narrations];
  }
}

vi.mock("@agent-town/graphclient", () => ({
  createGraphClient: vi.fn(),
  scoreboard: vi.fn(async () => scoreboardDto),
  loanHistory: vi.fn(async () => mockLoans),
  gdpSeries: vi.fn(async () => ({
    interval: "day",
    source: "rosterPayments",
    points: [{ timestamp: "1", gdpUsdc: "500000" }],
  })),
  fetchExternalSignals: vi.fn(async () => ({
    usdcBorrowApyBps: 410,
    dexVolume24hUsd: "100.00",
    fetchedAt: "2026-09-08T18:00:00.000Z",
    stale: false,
    sources: {
      lending: { subgraphId: "lend", name: "lending" },
      dex: { subgraphId: "dex", name: "dex" },
    },
  })),
  rosterJobs: vi.fn(async () => []),
}));

function makeSource(overrides: Partial<ConstructorParameters<typeof RealSource>[0]> = {}) {
  return new RealSource({
    tickMs: 15_000,
    pollMs: 60_000,
    env: {
      ENS_TOWN_NAME: "botanica",
      EXTERNAL_SIGNALS: "on",
      ALLOW_BROADCAST: "false",
      SUBGRAPH_URL: "https://example.com/subgraph",
    },
    graphClient: fakeGraph,
    ledger: new TestLedger(),
    balanceReader: async () => "2500000",
    resolveAgent: async (name) => ({
      ensName: `${name}.botanica.eth`,
      wallet: BO,
      wallet60: BO,
      role: "merchant",
      avatar: "/sprites/x.png",
      agentContext: "",
      creditScore: 72,
      reviews: [],
    }),
    mayorDeps: {
      circle: {
        createContractExecutionTransaction: vi.fn(),
        createTransaction: vi.fn(),
        getTransaction: vi.fn(),
        createWalletSet: vi.fn(),
        getWalletSet: vi.fn(),
        createWallets: vi.fn(),
        listWallets: vi.fn(),
        getWalletTokenBalance: vi.fn(),
      },
      mayorWalletId: "w-mayor",
      treasurerWalletId: "w-ada",
      broadcastAllowed: false,
    },
    ...overrides,
  });
}

const gdpDto = {
  interval: "day" as const,
  source: "rosterPayments" as const,
  points: [{ timestamp: "1", gdpUsdc: "500000" }],
};

const signalsDto = {
  usdcBorrowApyBps: 410,
  dexVolume24hUsd: "100.00",
  fetchedAt: "2026-09-08T18:00:00.000Z",
  stale: false,
  sources: {
    lending: { subgraphId: "lend", name: "lending" },
    dex: { subgraphId: "dex", name: "dex" },
  },
};

beforeEach(() => {
  mockLoans = [loanRow];
  vi.mocked(fetchScoreboard).mockReset().mockResolvedValue(scoreboardDto);
  vi.mocked(loanHistory).mockReset().mockImplementation(async () => mockLoans);
  vi.mocked(gdpSeries).mockReset().mockResolvedValue(gdpDto);
  vi.mocked(fetchExternalSignals).mockReset().mockResolvedValue(signalsDto);
  vi.mocked(rosterJobs).mockReset().mockResolvedValue([]);
});

describe("RealSource GET contract", () => {
  let source: RealSource;

  beforeEach(async () => {
    mockLoans = [loanRow];
    source = makeSource();
    await source.ready();
  });

  it("parses /state with first-tick startedAt", async () => {
    const ledger = new TestLedger();
    ledger.tick = 7;
    source = makeSource({ ledger });
    await source.ready();
    const app = createApp(source);
    const res = await app.request(API_ROUTES.state);
    expect(res.status).toBe(200);
    const body = StateResponseSchema.parse(await res.json());
    expect(body.startedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(body.tick).toBe(7);
    expect(body.flags.storyline).toBe("demo");
  });

  it("/agents with ENS credit scores", async () => {
    const app = createApp(source);
    const body = AgentsResponseSchema.parse(await (await app.request(API_ROUTES.agents)).json());
    expect(body).toHaveLength(8);
    expect(body.find((a) => a.name === "bo")?.creditScore).toBe(72);
  });

  it("/scoreboard with rate + signals", async () => {
    const app = createApp(source);
    const body = ScoreboardResponseSchema.parse(await (await app.request(API_ROUTES.scoreboard)).json());
    expect(body.signals.usdcBorrowApyBps).toBe(410);
    expect(body.defaults).toBe(1);
    expect(body.rate.spreadBps).toBe(200);
    expect(body.rate.defaultPremiumBps).toBe(200);
    expect(body.rate.baseRateBps).toBe(600);
    expect(body.rate.townRateBps).toBe(810);
  });

  it("filters /loans?status=pending", async () => {
    const app = createApp(source);
    const pending = LoansResponseSchema.parse(
      await (await app.request(`${API_ROUTES.loans}?status=pending`)).json(),
    );
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe("2");
  });

  it("/health returns real tick", async () => {
    const app = createApp(source);
    expect(await (await app.request("/health")).json()).toEqual({
      ok: true,
      mode: "real",
      tick: 1,
    });
  });

  it("applies narration from listNarration without per-agent queries", async () => {
    const ledger = new TestLedger();
    ledger.narrations.push({ tick: 1, agent: "bo", text: "Shelves are thin" });
    ledger.actions.push({
      tick: 1,
      agent: "gus",
      kind: "buy",
      tx: TX,
      status: "complete",
    });
    source = makeSource({ ledger });
    await source.ready();
    const bo = source.getAgents().find((a) => a.name === "bo");
    const gus = source.getAgents().find((a) => a.name === "gus");
    expect(bo?.narration).toBe("Shelves are thin");
    expect(gus?.lastDecision?.kind).toBe("buy");
  });

  it("keeps last-good cache when ledger times out", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ledger = new TestLedger();
    ledger.narrations.push({ tick: 1, agent: "ada", text: "Books balanced" });
    source = makeSource({ ledger });
    await source.ready();
    expect(source.getState().tick).toBe(1);
    ledger.tick = 2;
    ledger.fail = true;
    await source.refresh();
    expect(source.getState().tick).toBe(1);
    expect(source.getAgents().find((a) => a.name === "ada")?.narration).toBe("Books balanced");
  });
});

describe("RealSource mayor POST gate", () => {
  it("returns 501 without ALLOW_BROADCAST", async () => {
    const source = makeSource();
    await source.ready();
    const res = await createApp(source).request(API_ROUTES.mayorFund, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amountUsdc: "1000000" }),
    });
    expect(res.status).toBe(501);
    expect(ApiErrorSchema.parse(await res.json()).code).toBe("NOT_IMPLEMENTED");
  });

  it("returns tx when broadcast allowed (mocked Circle)", async () => {
    const execute = vi.fn().mockResolvedValue({ data: { id: "tx-1", state: "INITIATED" } });
    const source = makeSource({
      mayorDeps: {
        circle: {
          createContractExecutionTransaction: execute,
          createTransaction: vi.fn(),
          getTransaction: vi.fn().mockResolvedValue({
            data: {
              transaction: {
                id: "tx-1",
                state: "COMPLETE",
                txHash: TX,
              },
            },
          }),
          createWalletSet: vi.fn(),
          getWalletSet: vi.fn(),
          createWallets: vi.fn(),
          listWallets: vi.fn(),
          getWalletTokenBalance: vi.fn(),
        },
        mayorWalletId: "w-mayor",
        treasurerWalletId: "w-ada",
        treasuryAddress: "0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1",
        broadcastAllowed: true,
      },
    });
    await source.ready();
    const res = await createApp(source).request(API_ROUTES.mayorRate, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bps: 900 }),
    });
    expect(res.status).toBe(200);
    TxResponseSchema.parse(await res.json());
  });
});

describe("RealSource SSE", () => {
  it("refresh emits tick, tx, narration, loan_flagged", async () => {
    mockLoans = [];
    const ledger = new TestLedger();
    const source = makeSource({ ledger });
    const events: SseEvent[] = [];
    source.subscribe((ev) => events.push(ev));
    await source.ready();

    ledger.tick = 2;
    ledger.actions.push({
      tick: 2,
      agent: "bo",
      kind: "buy",
      tx: TX,
      status: "complete",
    });
    ledger.narrations.push({ tick: 2, agent: "bo", text: "Shopping time" });
    mockLoans = [
      {
        ...loanRow,
        id: "9",
        requestedAt: "2",
      },
    ];
    await source.refresh();

    expect(events.map((e) => e.event)).toEqual([
      "tick",
      "tx",
      "narration",
      "loan_flagged",
      "scoreboard",
    ]);
  });

  it("poll emits scoreboard after cursor seeded", async () => {
    const source = makeSource({ pollMs: 30 });
    const events: SseEvent[] = [];
    source.subscribe((ev) => events.push(ev));
    await source.ready();
    source.start();
    await new Promise((r) => setTimeout(r, 80));
    source.stop();
    expect(events.some((e) => e.event === "scoreboard")).toBe(true);
  });
});

describe("RealSource Studio 429 backoff", () => {
  const jobRow = {
    id: "j1",
    amount: "500000",
    status: "open",
    createdAt: "1",
    settledAt: null,
    client: { id: BO, ensName: "bo.botanica.eth" },
    provider: { id: BO, ensName: "bo.botanica.eth" },
  };

  function studio429(retryAfterSec = 3600): Error {
    const reset = Math.floor(Date.now() / 1000) + retryAfterSec;
    return Object.assign(new Error("Too Many Requests (429)"), {
      response: {
        status: 429,
        headers: new Headers({
          "retry-after": String(retryAfterSec),
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(reset),
        }),
      },
    });
  }

  function rejectStudio(err: Error): void {
    vi.mocked(fetchScoreboard).mockRejectedValue(err);
    vi.mocked(loanHistory).mockRejectedValue(err);
    vi.mocked(gdpSeries).mockRejectedValue(err);
    vi.mocked(rosterJobs).mockRejectedValue(err);
  }

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("keeps prior scoreboard/jobs and applies ledger on 429", async () => {
    vi.mocked(rosterJobs).mockResolvedValue([jobRow]);
    const ledger = new TestLedger();
    const source = makeSource({ ledger });
    const events: SseEvent[] = [];
    source.subscribe((ev) => events.push(ev));
    await source.ready();

    expect(source.getScoreboard().treasuryBalanceUsdc).toBe("3000000");
    expect(source.getScoreboard().ticks).toBe(1);
    expect(source.getAgent("bo").jobs[0]?.id).toBe("j1");

    ledger.tick = 2;
    ledger.actions.push({
      tick: 2,
      agent: "bo",
      kind: "buy",
      tx: TX,
      status: "complete",
    });
    ledger.narrations.push({ tick: 2, agent: "bo", text: "Shopping time" });
    rejectStudio(studio429());
    vi.mocked(fetchExternalSignals).mockResolvedValue({
      usdcBorrowApyBps: 410,
      dexVolume24hUsd: "100.00",
      fetchedAt: "2026-09-11T19:00:00.000Z",
      stale: true,
      sources: {
        lending: { subgraphId: "lend", name: "lending" },
        dex: { subgraphId: "dex", name: "dex" },
      },
    });

    await source.refresh();

    const sb = source.getScoreboard();
    expect(sb.treasuryBalanceUsdc).toBe("3000000");
    expect(sb.ticks).toBe(2);
    expect(sb.signals.stale).toBe(true);
    expect(source.getState().tick).toBe(2);
    expect(source.getAgent("bo").jobs[0]?.id).toBe("j1");
    expect(source.getAgents().find((a) => a.name === "bo")?.narration).toBe("Shopping time");
    expect(events.map((e) => e.event)).toEqual(["tick", "tx", "narration", "scoreboard"]);
  });

  it("skips Studio queries until Retry-After", async () => {
    const source = makeSource();
    await source.ready();
    rejectStudio(studio429(3600));
    await source.refresh();

    const scoreboardCalls = vi.mocked(fetchScoreboard).mock.calls.length;
    const jobsCalls = vi.mocked(rosterJobs).mock.calls.length;
    const signalCalls = vi.mocked(fetchExternalSignals).mock.calls.length;
    await source.refresh();
    expect(vi.mocked(fetchScoreboard).mock.calls.length).toBe(scoreboardCalls);
    expect(vi.mocked(rosterJobs).mock.calls.length).toBe(jobsCalls);
    expect(vi.mocked(fetchExternalSignals).mock.calls.length).toBe(signalCalls + 1);
  });
});
