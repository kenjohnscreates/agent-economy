// Negative + boundary tests for the API contract: bad payloads must fail,
// USDC must be strings, mayor rate is clamped to 100–2000 bps.
import { describe, expect, it } from "vitest";
import {
  API_DEFAULT_PORT,
  API_ROUTES,
  AgentSummarySchema,
  JOB_STATUSES,
  JobSchema,
  LoanSchema,
  MayorFundRequestSchema,
  MayorRateRequestSchema,
  ScoreboardResponseSchema,
  StateResponseSchema,
} from "./api.js";
import { FIXTURES } from "./fixtures.js";
import { LOAN_TERM_TICKS, NARRATION_MAX_CHARS } from "./rules.js";

describe("api contract rejects bad payloads", () => {
  it("balanceUsdc as number fails", () => {
    const bad = { ...FIXTURES.agents[0], balanceUsdc: 3 };
    expect(AgentSummarySchema.safeParse(bad).success).toBe(false);
  });

  it("balanceUsdc with decimals fails", () => {
    const bad = { ...FIXTURES.agents[0], balanceUsdc: "3.5" };
    expect(AgentSummarySchema.safeParse(bad).success).toBe(false);
  });

  it("creditScore out of 0–100 fails", () => {
    const bad = { ...FIXTURES.agents[0], creditScore: 101 };
    expect(AgentSummarySchema.safeParse(bad).success).toBe(false);
  });

  it("job status accepts every ERC-8183 state incl. rejected; unknown fails", () => {
    const base = FIXTURES.jobs[1];
    expect(JOB_STATUSES).toContain("rejected");
    for (const status of JOB_STATUSES) {
      expect(JobSchema.safeParse({ ...base, status }).success).toBe(true);
    }
    const rejected = JobSchema.parse({ ...base, id: "J-3", status: "rejected", settledAtTick: 7 });
    expect(rejected.status).toBe("rejected");
    expect(JobSchema.safeParse({ ...base, status: "cancelled" }).success).toBe(false);
  });

  it("loan has nullable dueAtTick", () => {
    expect(FIXTURES.loans[0]?.dueAtTick).toBe(4 + LOAN_TERM_TICKS);
    expect(LoanSchema.safeParse({ ...FIXTURES.loans[0], dueAtTick: null }).success).toBe(true);
    expect(LoanSchema.safeParse({ ...FIXTURES.loans[0], dueAtTick: -1 }).success).toBe(false);
  });

  it("agent narration is capped at NARRATION_MAX_CHARS", () => {
    const bad = { ...FIXTURES.agents[0], narration: "x".repeat(NARRATION_MAX_CHARS + 1) };
    expect(AgentSummarySchema.safeParse(bad).success).toBe(false);
    const ok = { ...FIXTURES.agents[0], narration: "x".repeat(NARRATION_MAX_CHARS) };
    expect(AgentSummarySchema.safeParse(ok).success).toBe(true);
  });

  it("scoreboard requires a non-negative integer defaults counter", () => {
    expect(
      ScoreboardResponseSchema.safeParse({ ...FIXTURES.scoreboard, defaults: -1 }).success,
    ).toBe(false);
    expect(
      ScoreboardResponseSchema.safeParse({ ...FIXTURES.scoreboard, defaults: 1.5 }).success,
    ).toBe(false);
  });

  it("unknown loan status fails", () => {
    const bad = { ...FIXTURES.loans[0], status: "cancelled" };
    expect(LoanSchema.safeParse(bad).success).toBe(false);
  });

  it("bad arcAddress fails", () => {
    const bad = { ...FIXTURES.agents[0], arcAddress: "0x123" };
    expect(AgentSummarySchema.safeParse(bad).success).toBe(false);
  });

  it("unknown storyline phase fails", () => {
    const bad = { ...FIXTURES.state, phase: "crash" };
    expect(StateResponseSchema.safeParse(bad).success).toBe(false);
  });

  it("mayor rate outside 100–2000 bps fails; inside passes", () => {
    expect(MayorRateRequestSchema.safeParse({ bps: 99 }).success).toBe(false);
    expect(MayorRateRequestSchema.safeParse({ bps: 2001 }).success).toBe(false);
    expect(MayorRateRequestSchema.safeParse({ bps: 100 }).success).toBe(true);
    expect(MayorRateRequestSchema.safeParse({ bps: 2000 }).success).toBe(true);
  });

  it("mayor fund requires a 6-dec string", () => {
    expect(MayorFundRequestSchema.safeParse({ amountUsdc: 5 }).success).toBe(false);
    expect(MayorFundRequestSchema.safeParse({ amountUsdc: "5000000" }).success).toBe(true);
  });
});

describe("routes", () => {
  it("match ARCHITECTURE §6.3 paths", () => {
    expect(API_DEFAULT_PORT).toBe(3001);
    expect(API_ROUTES.state).toBe("/state");
    expect(API_ROUTES.agent("ada")).toBe("/agents/ada");
    expect(API_ROUTES.loans).toBe("/loans");
    expect(API_ROUTES.mayorLoanDecision).toBe("/mayor/loan-decision");
    expect(API_ROUTES.visitor).toBe("/visitor");
    expect(API_ROUTES.visitorChat).toBe("/visitor/chat");
  });
});
