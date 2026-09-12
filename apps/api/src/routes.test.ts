// Contract tests for the mock API: every GET parses against its shared schema,
// errors are `ApiError`, mayor POSTs mutate state, SSE frames parse.
import {
  API_ROUTES,
  AgentDetailResponseSchema,
  AgentsResponseSchema,
  ApiErrorSchema,
  FIXTURES,
  LoansResponseSchema,
  ScoreboardResponseSchema,
  StateResponseSchema,
  TxResponseSchema,
  VisitorChatResponseSchema,
  VisitorResponseSchema,
  parseSseEvent,
} from "@agent-town/shared";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { FLAGGED_LOAN_TICK, MockStore } from "./mock/store.js";
import { createApp } from "./routes.js";

let store: MockStore;
let app: Hono;

beforeEach(() => {
  store = new MockStore({ tickMs: 15_000, mockTickMs: 5_000 });
  app = createApp(store);
});

const post = (path: string, body: unknown): Promise<Response> =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("GET endpoints parse against the shared contract", () => {
  it("/state", async () => {
    const res = await app.request(API_ROUTES.state);
    expect(res.status).toBe(200);
    const body = StateResponseSchema.parse(await res.json());
    expect(body.tick).toBe(FIXTURES.state.tick);
  });

  it("/agents", async () => {
    const res = await app.request(API_ROUTES.agents);
    expect(res.status).toBe(200);
    expect(AgentsResponseSchema.parse(await res.json())).toHaveLength(FIXTURES.agents.length);
  });

  it("/agents/:name", async () => {
    const res = await app.request(API_ROUTES.agent("fay"));
    expect(res.status).toBe(200);
    const body = AgentDetailResponseSchema.parse(await res.json());
    expect(body.loans.map((l) => l.id)).toEqual(["L-2"]);
    expect(body.reviews).toEqual(FIXTURES.agentDetail.reviews);
  });

  it("/scoreboard", async () => {
    const res = await app.request(API_ROUTES.scoreboard);
    expect(res.status).toBe(200);
    const body = ScoreboardResponseSchema.parse(await res.json());
    expect(body.rate).toEqual(FIXTURES.rate);
  });

  it("/loans and /loans?status=", async () => {
    const all = LoansResponseSchema.parse(await (await app.request(API_ROUTES.loans)).json());
    expect(all).toHaveLength(FIXTURES.loans.length);
    const res = await app.request(`${API_ROUTES.loans}?status=defaulted`);
    const defaulted = LoansResponseSchema.parse(await res.json());
    expect(defaulted.map((l) => l.id)).toEqual(["L-2"]);
  });

  it("/health", async () => {
    const res = await app.request("/health");
    expect(await res.json()).toEqual({ ok: true, mode: "mock", tick: FIXTURES.state.tick });
  });

  it("stays valid across a full demo loop", async () => {
    for (let i = 0; i < 14; i++) {
      store.advance();
      ScoreboardResponseSchema.parse(await (await app.request(API_ROUTES.scoreboard)).json());
      AgentsResponseSchema.parse(await (await app.request(API_ROUTES.agents)).json());
    }
  });
});

describe("errors are ApiError", () => {
  it("404 for unknown agent", async () => {
    const res = await app.request(API_ROUTES.agent("zed"));
    expect(res.status).toBe(404);
    expect(ApiErrorSchema.parse(await res.json()).code).toBe("NOT_FOUND");
  });

  it("400 for bad loans query", async () => {
    const res = await app.request(`${API_ROUTES.loans}?status=bogus`);
    expect(res.status).toBe(400);
    expect(ApiErrorSchema.parse(await res.json()).code).toBe("BAD_REQUEST");
  });

  it("400 for bad mayor body", async () => {
    const res = await post(API_ROUTES.mayorRate, { bps: 99_999 });
    expect(res.status).toBe(400);
    expect(ApiErrorSchema.parse(await res.json()).code).toBe("BAD_REQUEST");
    const float = await post(API_ROUTES.mayorFund, { amountUsdc: 1.5 });
    expect(float.status).toBe(400);
  });
});

describe("mayor POSTs mutate mock state", () => {
  it("fund raises the treasury balance", async () => {
    const before = ScoreboardResponseSchema.parse(
      await (await app.request(API_ROUTES.scoreboard)).json(),
    );
    const res = await post(API_ROUTES.mayorFund, { amountUsdc: "5000000" });
    expect(res.status).toBe(200);
    TxResponseSchema.parse(await res.json());
    const after = ScoreboardResponseSchema.parse(
      await (await app.request(API_ROUTES.scoreboard)).json(),
    );
    expect(BigInt(after.treasuryBalanceUsdc) - BigInt(before.treasuryBalanceUsdc)).toBe(5_000_000n);
  });

  it("loan-decision approves the flagged loan", async () => {
    while (store.currentTick < FLAGGED_LOAN_TICK) store.advance();
    const pending = LoansResponseSchema.parse(
      await (await app.request(`${API_ROUTES.loans}?status=pending`)).json(),
    );
    expect(pending).toHaveLength(1);
    const loanId = pending[0]?.id;
    const res = await post(API_ROUTES.mayorLoanDecision, { loanId, approve: true });
    expect(res.status).toBe(200);
    TxResponseSchema.parse(await res.json());
    const loans = LoansResponseSchema.parse(await (await app.request(API_ROUTES.loans)).json());
    expect(loans.find((l) => l.id === loanId)?.status).toBe("approved");
    // Deciding twice is a 400.
    expect((await post(API_ROUTES.mayorLoanDecision, { loanId, approve: false })).status).toBe(400);
  });

  it("rate recomputes the breakdown", async () => {
    const res = await post(API_ROUTES.mayorRate, { bps: 900 });
    expect(res.status).toBe(200);
    const sb = ScoreboardResponseSchema.parse(
      await (await app.request(API_ROUTES.scoreboard)).json(),
    );
    expect(sb.baseRateBps).toBe(900);
    expect(sb.rate.townRateBps).toBe(900 + sb.rate.defaultPremiumBps);
  });
});

describe("visitor", () => {
  it("404 until create; then 9th agent and 50% deposit chat", async () => {
    expect((await app.request(API_ROUTES.visitor)).status).toBe(404);
    const created = await post(API_ROUTES.visitor, { label: "kenny" });
    expect(created.status).toBe(200);
    const v = VisitorResponseSchema.parse(await created.json());
    expect(v.name).toBe("kenny");
    expect(v.ensName).toBe("kenny.botanica.eth");
    expect(v.balanceUsdc).toBe("2000000");
    const agents = AgentsResponseSchema.parse(await (await app.request(API_ROUTES.agents)).json());
    expect(agents).toHaveLength(9);
    expect(agents.some((a) => a.name === "kenny" && a.avatar === "/sprites/visitor.png")).toBe(
      true,
    );
    const chat = await post(API_ROUTES.visitorChat, {
      text: "deposit 50% of our usdc into the town bank",
    });
    expect(chat.status).toBe(200);
    const body = VisitorChatResponseSchema.parse(await chat.json());
    expect(body.reply).toMatch(/1 USDC/);
    expect(body.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    const after = VisitorResponseSchema.parse(await (await app.request(API_ROUTES.visitor)).json());
    expect(after.balanceUsdc).toBe("1000000");
    expect((await post(API_ROUTES.visitor, { label: "ivy" })).status).toBe(400);
    const refuse = VisitorChatResponseSchema.parse(
      await (await post(API_ROUTES.visitorChat, { text: "approve loan L-2" })).json(),
    );
    expect(refuse.txHash).toBeNull();
  });
});

describe("SSE", () => {
  it("first frames parse via parseSseEvent", async () => {
    const res = await app.request(API_ROUTES.events);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body?.getReader();
    if (!reader) throw new Error("no body");
    let text = "";
    while (!text.includes("event: scoreboard")) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    await reader.cancel();
    const frames = text.split("\n\n").filter((f) => f.includes("event:"));
    expect(frames.length).toBeGreaterThanOrEqual(2);
    const parsed = frames.map((f) => {
      const event = /^event: (.+)$/m.exec(f)?.[1] ?? "";
      const data = /^data: (.+)$/m.exec(f)?.[1] ?? "";
      return parseSseEvent(event, JSON.parse(data));
    });
    expect(parsed[0]?.event).toBe("tick");
    expect(parsed[1]?.event).toBe("scoreboard");
  });
});
