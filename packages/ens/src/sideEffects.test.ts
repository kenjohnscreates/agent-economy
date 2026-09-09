// M4.6: score math, 1st default → 35 + review, 2nd default → revokeName,
// repay bump, idempotency, treasurer-only, no tokenId, broadcast gate.
import { DEFAULT_CREDIT_SCORE, type EnsReview } from "@agent-town/shared";
import { getAddress } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EnsClientConfig, WriteResult } from "./client.js";
import {
  FIRST_DEFAULT_SCORE,
  REPAY_SCORE_DELTA,
  alreadyApplied,
  applyLoanOutcome,
  assertTreasurerSigner,
  clampScore,
  countDefaultReviews,
  formatOutcomeNote,
  ledgerKey,
  planLoanOutcome,
  requireBroadcastGate,
  scoreAfterRepay,
  type SideEffectClient,
} from "./sideEffects.js";

const TREASURER = getAddress("0xD428294070595052d9E0607f28CDf51b52156d2A");
const DEE = getAddress("0x70b1300425c37af893ca4841e4183e7f0a1bdb89");

const defaultReview: EnsReview = {
  by: "ada",
  tick: 7,
  score: 35,
  note: "defaulted on 1 USDC, tick 7",
};

function mockEns(state: { creditScore?: number; reviews?: EnsReview[] } = {}): SideEffectClient & {
  setCreditScore: ReturnType<typeof vi.fn>;
  appendReview: ReturnType<typeof vi.fn>;
  revokeName: ReturnType<typeof vi.fn>;
  resolveAgent: ReturnType<typeof vi.fn>;
} {
  const ok: WriteResult = { simulated: true };
  return {
    resolveAgent: vi.fn(async (name: string) => ({
      ensName: name.includes(".") ? name : `${name}.botanica.eth`,
      wallet: DEE,
      wallet60: DEE,
      role: "worker" as const,
      avatar: "",
      agentContext: "",
      ...state,
    })),
    setCreditScore: vi.fn(async () => ok),
    appendReview: vi.fn(async () => ok),
    revokeName: vi.fn(async () => ok),
  };
}

function applyCfg(ens: SideEffectClient, extra: EnsClientConfig = {}) {
  return { ens, account: TREASURER, forbiddenSigners: [DEE] as const, treasurer: TREASURER, ...extra };
}

function keysOf(value: unknown): string[] {
  return JSON.stringify(value).match(/"[^"]+"/g) ?? [];
}

describe("score math", () => {
  it("unset score uses DEFAULT_CREDIT_SCORE then +5, clamped 0–100", () => {
    expect(DEFAULT_CREDIT_SCORE).toBe(70);
    expect(REPAY_SCORE_DELTA).toBe(5);
    expect(scoreAfterRepay(undefined)).toBe(75);
    expect(scoreAfterRepay(80)).toBe(85);
    expect(scoreAfterRepay(98)).toBe(100);
    expect(scoreAfterRepay(0)).toBe(5);
    expect(clampScore(-4)).toBe(0);
    expect(clampScore(140)).toBe(100);
  });
});

describe("planLoanOutcome", () => {
  it("repay bumps score and appends a treasurer review", () => {
    const plan = planLoanOutcome(
      { agent: "bo", kind: "repay", tick: 5, amountUsdc: "0.3", loanId: 1 },
      { creditScore: 70 },
    );
    expect(plan.action).toBe("repay");
    expect(plan.newScore).toBe(75);
    expect(plan.revoke).toBe(false);
    expect(plan.review).toEqual({
      by: "ada",
      tick: 5,
      score: 75,
      note: "repaid 0.3 USDC, tick 5, loan 1",
    });
    expect(plan.review?.note.length).toBeLessThanOrEqual(200);
    expect(plan).not.toHaveProperty("tokenId");
  });

  it("1st default sets score 35 and PRD §12 review note", () => {
    expect(formatOutcomeNote({ kind: "default", amountUsdc: "1", tick: 7 })).toBe(
      "defaulted on 1 USDC, tick 7",
    );
    const plan = planLoanOutcome({ agent: "fay", kind: "default", tick: 7, amountUsdc: "1" });
    expect(plan.action).toBe("first-default");
    expect(plan.newScore).toBe(FIRST_DEFAULT_SCORE);
    expect(plan.review).toEqual(defaultReview);
    expect(plan.revoke).toBe(false);
    expect(countDefaultReviews(plan.review ? [plan.review] : [])).toBe(1);
  });

  it("2nd default on the same agent is revoke only (count from reviews)", () => {
    const plan = planLoanOutcome(
      { agent: "fay", kind: "default", tick: 11, amountUsdc: "1" },
      { creditScore: 35, reviews: [defaultReview] },
    );
    expect(plan.action).toBe("second-default");
    expect(plan.revoke).toBe(true);
    expect(plan.newScore).toBeUndefined();
    expect(plan.review).toBeUndefined();
  });

  it("priorDefaults >= 1 is 2nd default even when reviews are empty", () => {
    const plan = planLoanOutcome({
      agent: "fay",
      kind: "default",
      tick: 11,
      amountUsdc: "1",
      priorDefaults: 1,
    });
    expect(plan.action).toBe("second-default");
    expect(plan.revoke).toBe(true);
  });

  it("same (agent, loanId/tick, kind) is idempotent", () => {
    const outcome = { agent: "fay", kind: "default" as const, tick: 7, amountUsdc: "1" };
    expect(alreadyApplied([defaultReview], outcome)).toBe(true);
    const plan = planLoanOutcome(outcome, { reviews: [defaultReview] });
    expect(plan.skipped).toBe(true);
    expect(plan.action).toBe("skip");
    expect(plan.revoke).toBe(false);
    expect(ledgerKey(outcome)).toBe("fay:default:tick:7");
    expect(ledgerKey({ ...outcome, loanId: 2 })).toBe("fay:default:loan:2");
  });
});

describe("applyLoanOutcome (mocked client)", () => {
  it("1st default calls setCreditScore(35) then appendReview; not revokeName", async () => {
    const ens = mockEns({ creditScore: 70, reviews: [] });
    const result = await applyLoanOutcome(
      { agent: "fay", kind: "default", tick: 7, amountUsdc: "1" },
      applyCfg(ens),
    );
    expect(result.plan.newScore).toBe(35);
    expect(ens.setCreditScore).toHaveBeenCalledWith("fay", 35, expect.anything());
    expect(ens.appendReview).toHaveBeenCalledWith("fay", defaultReview, expect.anything());
    expect(ens.revokeName).not.toHaveBeenCalled();
    expect(result.writes).toHaveLength(2);
    expect(result).not.toHaveProperty("tokenId");
    expect(keysOf(result).join(" ")).not.toMatch(/tokenId/);
  });

  it("2nd default calls revokeName and does not write score/review", async () => {
    const ens = mockEns({ creditScore: 35, reviews: [defaultReview] });
    const result = await applyLoanOutcome(
      { agent: "fay", kind: "default", tick: 11, amountUsdc: "1" },
      applyCfg(ens),
    );
    expect(result.plan.action).toBe("second-default");
    expect(ens.revokeName).toHaveBeenCalledWith("fay", expect.anything());
    expect(ens.setCreditScore).not.toHaveBeenCalled();
    expect(ens.appendReview).not.toHaveBeenCalled();
  });

  it("repay bump calls setCreditScore then appendReview", async () => {
    const ens = mockEns({ creditScore: 70 });
    const result = await applyLoanOutcome(
      { agent: "bo", kind: "repay", tick: 5, amountUsdc: "0.3", loanId: 1 },
      applyCfg(ens),
    );
    expect(result.plan.newScore).toBe(75);
    expect(ens.setCreditScore).toHaveBeenCalledWith("bo", 75, expect.anything());
    expect(ens.appendReview).toHaveBeenCalledTimes(1);
    expect(ens.revokeName).not.toHaveBeenCalled();
  });

  it("does not double-write when the review is already on the name", async () => {
    const ens = mockEns({ creditScore: 35, reviews: [defaultReview] });
    const result = await applyLoanOutcome(
      { agent: "fay", kind: "default", tick: 7, amountUsdc: "1" },
      applyCfg(ens),
    );
    expect(result.plan.skipped).toBe(true);
    expect(result.writes).toEqual([]);
    expect(ens.setCreditScore).not.toHaveBeenCalled();
    expect(ens.revokeName).not.toHaveBeenCalled();
  });

  it("refuses worker wallets", async () => {
    const ens = mockEns();
    await expect(
      applyLoanOutcome(
        { agent: "fay", kind: "default", tick: 7, amountUsdc: "1" },
        { ens, account: DEE, forbiddenSigners: [DEE], treasurer: TREASURER },
      ),
    ).rejects.toThrow(/never a worker wallet/);
    expect(ens.resolveAgent).not.toHaveBeenCalled();
  });
});

describe("broadcast gate", () => {
  const prev = process.env.ALLOW_BROADCAST;

  afterEach(() => {
    if (prev === undefined) delete process.env.ALLOW_BROADCAST;
    else process.env.ALLOW_BROADCAST = prev;
  });

  it("refuses broadcast without ALLOW_BROADCAST=true", async () => {
    delete process.env.ALLOW_BROADCAST;
    expect(() => requireBroadcastGate(true)).toThrow(/ALLOW_BROADCAST/);
    const ens = mockEns();
    await expect(
      applyLoanOutcome(
        { agent: "fay", kind: "default", tick: 7, amountUsdc: "1" },
        applyCfg(ens, { broadcast: true }),
      ),
    ).rejects.toThrow(/ALLOW_BROADCAST/);
    expect(ens.setCreditScore).not.toHaveBeenCalled();
    process.env.ALLOW_BROADCAST = "true";
    expect(() => requireBroadcastGate(true)).not.toThrow();
  });
});

describe("assertTreasurerSigner", () => {
  it("accepts the treasurer and rejects dee", () => {
    expect(assertTreasurerSigner(TREASURER, { treasurer: TREASURER, forbidden: [DEE] })).toBe(
      TREASURER,
    );
    expect(() => assertTreasurerSigner(DEE, { treasurer: TREASURER, forbidden: [DEE] })).toThrow(
      /worker wallet/,
    );
  });
});

describe("resolveAgent (live Sepolia, read-only)", () => {
  it("fay.botanica.eth resolves without a tokenId field", async (ctx) => {
    if (!process.env.SEPOLIA_RPC_URL) {
      ctx.skip();
      return;
    }
    const { createPublicClient, http } = await import("viem");
    const { sepolia } = await import("viem/chains");
    const { resolveAgent } = await import("./client.js");
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(process.env.SEPOLIA_RPC_URL, { timeout: 12_000, retryCount: 0 }),
    });
    const agent = await resolveAgent("fay", { publicClient });
    expect(agent.ensName).toBe("fay.botanica.eth");
    expect(agent.role).toBe("worker");
    expect(agent).not.toHaveProperty("tokenId");
  }, 20_000);
});
