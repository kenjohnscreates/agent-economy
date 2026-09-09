// Every fixture must parse against its schema — this is the guard that keeps
// the M0.7 mock server and the FE in lockstep with the frozen contract.
import { describe, expect, it } from "vitest";
import {
  AgentDetailResponseSchema,
  AgentsResponseSchema,
  ApiErrorSchema,
  JobSchema,
  LoansResponseSchema,
  RateBreakdownSchema,
  ScoreboardResponseSchema,
  SignalsSchema,
  StateResponseSchema,
  TxResponseSchema,
} from "./api.js";
import { SseEventSchema } from "./events.js";
import { FIXTURES, FIXTURE_TICK } from "./fixtures.js";

describe("fixtures parse against the API contract", () => {
  it("state", () => expect(StateResponseSchema.parse(FIXTURES.state)).toEqual(FIXTURES.state));
  it("agents (8 at tick 7 / default)", () => {
    const parsed = AgentsResponseSchema.parse(FIXTURES.agents);
    expect(parsed).toHaveLength(8);
    expect(FIXTURES.state.tick).toBe(FIXTURE_TICK);
    expect(FIXTURES.state.phase).toBe("default");
  });
  it("agent detail", () => {
    expect(AgentDetailResponseSchema.parse(FIXTURES.agentDetail)).toEqual(FIXTURES.agentDetail);
  });
  it("loans (2)", () => expect(LoansResponseSchema.parse(FIXTURES.loans)).toHaveLength(2));
  it("jobs (2)", () => {
    expect(FIXTURES.jobs).toHaveLength(2);
    for (const job of FIXTURES.jobs) expect(JobSchema.parse(job)).toEqual(job);
  });
  it("signals (stale=false)", () => {
    expect(SignalsSchema.parse(FIXTURES.signals).stale).toBe(false);
  });
  it("rate breakdown", () =>
    expect(RateBreakdownSchema.parse(FIXTURES.rate)).toEqual(FIXTURES.rate));
  it("scoreboard", () => {
    expect(ScoreboardResponseSchema.parse(FIXTURES.scoreboard)).toEqual(FIXTURES.scoreboard);
  });
  it("tx response", () =>
    expect(TxResponseSchema.parse(FIXTURES.txResponse)).toEqual(FIXTURES.txResponse));
  it("api error", () => expect(ApiErrorSchema.parse(FIXTURES.apiError)).toEqual(FIXTURES.apiError));
  it("sse envelopes (one per event name)", () => {
    expect(FIXTURES.sseEvents).toHaveLength(5);
    for (const ev of FIXTURES.sseEvents) expect(SseEventSchema.parse(ev)).toEqual(ev);
  });

  it("USDC amounts are 6-dec integer strings, never numbers", () => {
    for (const a of FIXTURES.agents) expect(typeof a.balanceUsdc).toBe("string");
    expect(FIXTURES.scoreboard.gdpUsdc).toMatch(/^\d+$/);
  });
});
