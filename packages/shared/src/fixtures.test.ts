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
import { GRACE_TICKS, LOAN_TERM_TICKS } from "./rules.js";

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

  it("scoreboard numbers are internally consistent", () => {
    const { scoreboard: s, jobs, loans } = FIXTURES;
    const out = BigInt(s.outstandingUsdc);
    const expectedUtil = Number((out * 10_000n) / (BigInt(s.treasuryBalanceUsdc) + out));
    expect(s.rate.utilisationBps).toBe(expectedUtil);
    expect(s.rate.utilisationBps).toBe(860);
    expect(s.jobsCompleted).toBe(jobs.filter((j) => j.status === "completed").length);
    expect(s.defaults).toBe(loans.filter((l) => l.status === "defaulted").length);
    expect(s.rate.townRateBps).toBe(s.rate.baseRateBps + s.rate.defaultPremiumBps);
    expect(s.baseRateBps).toBe(s.rate.baseRateBps);
  });

  it("loan timeline: approved + LOAN_TERM_TICKS + GRACE_TICKS = defaultedAtTick", () => {
    const l2 = FIXTURES.loans[1];
    expect(l2?.status).toBe("defaulted");
    expect(l2?.dueAtTick).toBe((l2?.approvedAtTick ?? 0) + LOAN_TERM_TICKS);
    expect(l2?.defaultedAtTick).toBe((l2?.dueAtTick ?? 0) + GRACE_TICKS);
  });

  it("every lastDecision.kind is an action the agent's role can take", () => {
    const hal = FIXTURES.agents.find((a) => a.name === "hal");
    expect(["buy", "idle"]).toContain(hal?.lastDecision?.kind);
  });

  it("USDC amounts are 6-dec integer strings, never numbers", () => {
    for (const a of FIXTURES.agents) expect(typeof a.balanceUsdc).toBe("string");
    expect(FIXTURES.scoreboard.gdpUsdc).toMatch(/^\d+$/);
  });
});
