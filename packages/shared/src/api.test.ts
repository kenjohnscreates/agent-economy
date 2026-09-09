// Negative + boundary tests for the API contract: bad payloads must fail,
// USDC must be strings, mayor rate is clamped to 100–2000 bps.
import { describe, expect, it } from "vitest";
import {
  API_DEFAULT_PORT,
  API_ROUTES,
  AgentSummarySchema,
  LoanSchema,
  MayorFundRequestSchema,
  MayorRateRequestSchema,
  StateResponseSchema,
} from "./api.js";
import { FIXTURES } from "./fixtures.js";

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
  });
});
