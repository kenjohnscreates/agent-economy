// Treasurer advisor unit tests — fake provider only (no network, no LLM keys).
import { LLM_TIMEOUT_MS } from "@agent-town/shared";
import { describe, expect, it, vi } from "vitest";
import {
  advise,
  overlayTreasurerLoanAdvice,
  type AdvisorAdvice,
  type AdvisorInput,
  type LlmProvider,
  type QuerySubgraphFn,
} from "./advisor.js";
import { parseSimConfig } from "./config.js";
import { decide, type RulesLoanDecision } from "./decide.js";
import { loadWorld, type WorldLoan } from "./world.js";
import { rosterEntry } from "@agent-town/shared";

const ada = rosterEntry("ada");

function rulesApprove(max = "100"): RulesLoanDecision {
  return {
    decision: "approve",
    maxAmount: max,
    reasoning: "Score 70 ≥ 60 and utilisation 20% < 80%.",
  };
}

function rulesFlag(reason = "Score 50 < 60; flag to mayor."): RulesLoanDecision {
  return { decision: "flag", maxAmount: "0", reasoning: reason };
}

function baseInput(over: Partial<AdvisorInput> = {}): AdvisorInput {
  return {
    borrower: "bo",
    creditScore: 70,
    balanceUsdc: "500000",
    defaults: 0,
    utilisationBps: 2000,
    baseRateBps: 610,
    requestedUsdc: "100",
    rulesDecision: rulesApprove(),
    ...over,
  };
}

function llmJson(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    decision: "approve",
    maxAmount: "100",
    reasoning: "Looks solvent at current utilisation.",
    confidence: 0.8,
    ...over,
  });
}

function providerOf(text: string): LlmProvider {
  return { complete: vi.fn(async () => text) };
}

const pending: WorldLoan = {
  id: "L-1",
  borrower: "bo",
  principalUsdc: "1200000",
  status: "pending",
  approvedAtTick: null,
};

function approveWorld(over: Parameters<typeof loadWorld>[1] = {}) {
  return loadWorld(1, {
    loans: [pending],
    creditScores: { bo: 70 },
    treasury: {
      utilisationBps: 2000,
      outstandingUsdc: "0",
      baseRateBps: 610,
      defaults: 0,
    },
    ...over,
  });
}

type Case = {
  name: string;
  flags: { llmAdvisor: boolean };
  input: AdvisorInput;
  llm?: string;
  expected: Pick<AdvisorAdvice, "decision" | "maxAmount" | "source">;
};

const CASES: Case[] = [
  {
    name: "1 LLM off + rules approve",
    flags: { llmAdvisor: false },
    input: baseInput(),
    expected: { decision: "approve", maxAmount: "100", source: "rules" },
  },
  {
    name: "2 LLM off + low score flag",
    flags: { llmAdvisor: false },
    input: baseInput({
      creditScore: 40,
      rulesDecision: rulesFlag(),
    }),
    expected: { decision: "flag", maxAmount: "0", source: "rules" },
  },
  {
    name: "3 LLM off + high util flag",
    flags: { llmAdvisor: false },
    input: baseInput({
      utilisationBps: 8500,
      rulesDecision: rulesFlag("Utilisation 85% ≥ 80%; flag to mayor."),
    }),
    expected: { decision: "flag", maxAmount: "0", source: "rules" },
  },
  {
    name: "4 LLM confirm approve",
    flags: { llmAdvisor: true },
    input: baseInput(),
    llm: llmJson({ reasoning: "Score and utilisation both clear the bar." }),
    expected: { decision: "approve", maxAmount: "100", source: "llm" },
  },
  {
    name: "5 LLM deny vs rules approve",
    flags: { llmAdvisor: true },
    input: baseInput(),
    llm: llmJson({ decision: "deny", maxAmount: "0", reasoning: "Thin cash buffer; deny." }),
    expected: { decision: "deny", maxAmount: "0", source: "llm" },
  },
  {
    name: "6 LLM flag vs rules approve",
    flags: { llmAdvisor: true },
    input: baseInput(),
    llm: llmJson({
      decision: "flag",
      maxAmount: "100",
      reasoning: "Send to mayor for a second look.",
    }),
    expected: { decision: "flag", maxAmount: "100", source: "llm" },
  },
  {
    name: "7 LLM approve vs rules flag → flag",
    flags: { llmAdvisor: true },
    input: baseInput({
      creditScore: 50,
      rulesDecision: rulesFlag(),
    }),
    llm: llmJson({ decision: "approve", maxAmount: "999", reasoning: "I'd still lend." }),
    expected: { decision: "flag", maxAmount: "0", source: "llm" },
  },
  {
    name: "8 LLM maxAmount 999 clamped to rules",
    flags: { llmAdvisor: true },
    input: baseInput({ rulesDecision: rulesApprove("100") }),
    llm: llmJson({ maxAmount: 999, reasoning: "Approve a large line." }),
    expected: { decision: "approve", maxAmount: "100", source: "llm" },
  },
  {
    name: "9 LLM + subgraph repaid history",
    flags: { llmAdvisor: true },
    input: baseInput({ defaults: 0 }),
    llm: llmJson({ reasoning: "Two prior loans repaid on time." }),
    expected: { decision: "approve", maxAmount: "100", source: "llm" },
  },
  {
    name: "10 LLM flag after prior defaults (mocked subgraph)",
    flags: { llmAdvisor: true },
    input: baseInput({ defaults: 2 }),
    llm: llmJson({
      decision: "flag",
      maxAmount: "0",
      reasoning: "Two defaults on record; flag to mayor.",
    }),
    expected: { decision: "flag", maxAmount: "0", source: "llm" },
  },
];

describe("advise fixtures (10 decisions with reasoning)", () => {
  it.each(CASES)("$name", async (row) => {
    const complete = vi.fn(async () => row.llm ?? llmJson());
    const advice = await advise(row.input, row.flags, { complete });
    expect(advice.decision).toBe(row.expected.decision);
    expect(advice.maxAmount).toBe(row.expected.maxAmount);
    expect(advice.source).toBe(row.expected.source);
    expect(advice.reasoning.length).toBeGreaterThan(0);
    expect(advice.confidence).toBeGreaterThanOrEqual(0);
    expect(advice.confidence).toBeLessThanOrEqual(1);
    if (!row.flags.llmAdvisor) expect(complete).not.toHaveBeenCalled();
  });
});

describe("advise guards", () => {
  it(`timeout (< ${LLM_TIMEOUT_MS}ms budget in prod) falls back to rules`, async () => {
    const complete = vi.fn((_prompt: string, signal: AbortSignal) => {
      return new Promise<string>((_, reject) => {
        const onAbort = () => reject(new Error("aborted"));
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      });
    });
    const input = baseInput();
    const advice = await advise(input, { llmAdvisor: true }, { complete }, 30);
    expect(LLM_TIMEOUT_MS).toBeGreaterThanOrEqual(8000);
    expect(complete).toHaveBeenCalledOnce();
    expect(advice).toEqual({
      decision: "approve",
      maxAmount: "100",
      reasoning: input.rulesDecision.reasoning,
      confidence: 1,
      source: "rules",
    });
  });

  it("LLM maxAmount 999 > rules → clamped", async () => {
    const advice = await advise(
      baseInput({ rulesDecision: rulesApprove("100") }),
      { llmAdvisor: true },
      providerOf(llmJson({ maxAmount: 999, reasoning: "Cap me." })),
    );
    expect(advice.decision).toBe("approve");
    expect(advice.maxAmount).toBe("100");
    expect(advice.source).toBe("llm");
    expect(advice.reasoning.length).toBeGreaterThan(0);
  });

  it("LLM approve + rules flag → flag", async () => {
    const advice = await advise(
      baseInput({ creditScore: 50, rulesDecision: rulesFlag() }),
      { llmAdvisor: true },
      providerOf(llmJson({ decision: "approve", maxAmount: "999", reasoning: "Approve anyway." })),
    );
    expect(advice.decision).toBe("flag");
    expect(advice.maxAmount).toBe("0");
    expect(advice.reasoning.length).toBeGreaterThan(0);
  });

  it("provider throw / bad JSON falls back to rules with reasoning", async () => {
    const boom = await advise(
      baseInput(),
      { llmAdvisor: true },
      {
        complete: vi.fn(async () => {
          throw new Error("provider down");
        }),
      },
    );
    expect(boom.source).toBe("rules");
    expect(boom.reasoning.length).toBeGreaterThan(0);
    const bad = await advise(baseInput(), { llmAdvisor: true }, providerOf("not-json"));
    expect(bad.source).toBe("rules");
    expect(bad.decision).toBe("approve");
  });

  it("querySubgraph is mocked and included; live query is not used", async () => {
    const querySubgraph: QuerySubgraphFn = vi.fn(async () => ({
      defaults: 0,
      repaidCount: 2,
      loansTaken: 2,
      balanceDeposited: "1000000",
    }));
    const complete = vi.fn(async (prompt: string) => {
      expect(prompt).toContain("repaidCount");
      return llmJson({ reasoning: "Two prior loans repaid on time." });
    });
    const advice = await advise(
      baseInput(),
      { llmAdvisor: true },
      { complete },
      LLM_TIMEOUT_MS,
      querySubgraph,
    );
    expect(querySubgraph).toHaveBeenCalledWith("bo");
    expect(advice.reasoning).toContain("repaid");
  });

  it("querySubgraph throw falls back to rules", async () => {
    const querySubgraph: QuerySubgraphFn = vi.fn(async () => {
      throw new Error("studio down");
    });
    const advice = await advise(
      baseInput(),
      { llmAdvisor: true },
      providerOf(llmJson()),
      8000,
      querySubgraph,
    );
    expect(advice.source).toBe("rules");
    expect(advice.reasoning.length).toBeGreaterThan(0);
  });
});

describe("LLM_ADVISOR default off", () => {
  it("parseSimConfig defaults llmAdvisor false; provider is not called", async () => {
    const config = parseSimConfig({});
    expect(config.flags.llmAdvisor).toBe(false);
    expect(config.llmProvider).toBe("off");
    const complete = vi.fn(async () => llmJson());
    const advice = await advise(baseInput(), { llmAdvisor: config.flags.llmAdvisor }, { complete });
    expect(complete).not.toHaveBeenCalled();
    expect(advice.source).toBe("rules");
    expect(advice.reasoning.length).toBeGreaterThan(0);
  });
});

describe("overlayTreasurerLoanAdvice", () => {
  it("flag off leaves decide() approve_loan unchanged", async () => {
    const world = approveWorld();
    const actions = decide(ada, { tick: 1, phase: "boom", world });
    const complete = vi.fn(async () => llmJson());
    const out = await overlayTreasurerLoanAdvice(
      actions,
      world,
      { llmAdvisor: false },
      { complete },
    );
    expect(complete).not.toHaveBeenCalled();
    expect(out).toEqual(actions);
    expect(out[0]?.kind).toBe("approve_loan");
  });

  it("LLM deny replaces approve_loan", async () => {
    const world = approveWorld();
    const actions = decide(ada, { tick: 1, phase: "boom", world });
    const out = await overlayTreasurerLoanAdvice(
      actions,
      world,
      { llmAdvisor: true },
      providerOf(llmJson({ decision: "deny", maxAmount: "0", reasoning: "Deny this one." })),
    );
    expect(out.some((a) => a.kind === "approve_loan")).toBe(false);
    expect(out[0]?.kind).toBe("deny_loan");
  });
});
