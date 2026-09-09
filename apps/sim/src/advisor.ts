// Treasurer LLM advisor — loan decisions only (ARCHITECTURE §6.2, PRD §5).
// Off path (default): rulesLoanDecision one-liner. On path: injected `{complete}`
// with AbortSignal + LLM_TIMEOUT_MS; timeout/error/bad JSON → rules.
// Hard cap: maxAmount ≤ rulesMax; rules flag blocks auto-approve.
import { AdvisorDecisionSchema, LLM_TIMEOUT_MS, UnitSchema, UsdcSchema } from "@agent-town/shared";
import { z } from "zod";
import {
  pendingRosterLoan,
  rulesLoanDecision,
  type ProposedAction,
  type RulesLoanDecision,
} from "./decide.js";
import type { LlmProvider } from "./narrator.js";
import { isRosterAgent, usdcBigint, type WorldState } from "./world.js";

export type { LlmProvider } from "./narrator.js";
export type { RulesLoanDecision };

export interface AdvisorFlags {
  llmAdvisor: boolean;
}

export interface AdvisorInput {
  borrower: string;
  creditScore: number;
  balanceUsdc: string;
  defaults: number;
  utilisationBps: number;
  baseRateBps: number;
  requestedUsdc: string;
  rulesDecision: RulesLoanDecision;
}

export interface SubgraphHistory {
  defaults: number;
  repaidCount: number;
  loansTaken: number;
  balanceDeposited?: string;
}

export type QuerySubgraphFn = (borrower: string) => Promise<SubgraphHistory | null>;

/** Card output + `source` for frozen AdvisorVerdict mapping. maxAmount is USDC string. */
export const AdvisorAdviceSchema = z.object({
  decision: AdvisorDecisionSchema,
  maxAmount: UsdcSchema,
  reasoning: z.string().min(1),
  confidence: UnitSchema,
  source: z.enum(["rules", "llm"]),
});
export type AdvisorAdvice = z.infer<typeof AdvisorAdviceSchema>;

const LlmAdviceJsonSchema = z.object({
  decision: AdvisorDecisionSchema,
  maxAmount: z.union([
    UsdcSchema,
    z
      .number()
      .int()
      .nonnegative()
      .transform((n) => String(n)),
  ]),
  reasoning: z.string().min(1),
  confidence: UnitSchema,
});

function clampUsdc(amount: string, cap: string): string {
  return usdcBigint(amount) > usdcBigint(cap) ? cap : amount;
}

function rulesAdvice(input: AdvisorInput): AdvisorAdvice {
  const rules = input.rulesDecision;
  return {
    decision: rules.decision,
    maxAmount: rules.maxAmount,
    reasoning: rules.reasoning,
    confidence: 1,
    source: "rules",
  };
}

function applyGuards(
  llm: z.infer<typeof LlmAdviceJsonSchema>,
  rules: RulesLoanDecision,
): AdvisorAdvice {
  let decision = llm.decision;
  if (rules.decision === "flag" || rules.decision === "deny") {
    decision = rules.decision === "deny" ? "deny" : "flag";
  }
  let maxAmount = clampUsdc(llm.maxAmount, rules.maxAmount);
  if (decision === "deny") maxAmount = "0";
  return {
    decision,
    maxAmount,
    reasoning: llm.reasoning,
    confidence: llm.confidence,
    source: "llm",
  };
}

function parseLlmJson(raw: string): z.infer<typeof LlmAdviceJsonSchema> {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fence?.[1]?.trim() ?? trimmed;
  return LlmAdviceJsonSchema.parse(JSON.parse(text) as unknown);
}

function advisorPrompt(input: AdvisorInput, history?: SubgraphHistory | null): string {
  const payload = {
    borrower: input.borrower,
    creditScore: input.creditScore,
    balanceUsdc: input.balanceUsdc,
    defaults: input.defaults,
    utilisationBps: input.utilisationBps,
    baseRateBps: input.baseRateBps,
    requestedUsdc: input.requestedUsdc,
    rulesDecision: input.rulesDecision,
    subgraphHistory: history ?? null,
  };
  return [
    "You are the Agent Town treasurer advisor.",
    "Reply with JSON only: {decision, maxAmount, reasoning, confidence}.",
    "decision is approve|deny|flag. maxAmount is a 6-dec USDC integer string.",
    "confidence is 0..1. reasoning is one sentence.",
    "You cannot exceed rulesDecision.maxAmount or auto-approve when rules flagged.",
    `Signals: ${JSON.stringify(payload)}`,
  ].join(" ");
}

async function completeWithTimeout(
  provider: LlmProvider,
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`LLM advisor timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([provider.complete(prompt, controller.signal), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function applyAdviceToActions(
  actions: ProposedAction[],
  loanId: string,
  advice: AdvisorAdvice,
): ProposedAction[] {
  const rest = actions.filter(
    (a) => a.kind !== "approve_loan" && a.kind !== "deny_loan" && a.kind !== "idle",
  );
  if (advice.decision === "approve") {
    return [{ kind: "approve_loan", loanId, amountUsdc: advice.maxAmount }, ...rest];
  }
  if (advice.decision === "deny") {
    return [{ kind: "deny_loan", loanId, amountUsdc: advice.maxAmount }, ...rest];
  }
  return rest.length > 0 ? rest : [{ kind: "idle" }];
}

export function advisorInputFromWorld(world: WorldState): AdvisorInput | undefined {
  const loan = pendingRosterLoan(world);
  if (!loan || !isRosterAgent(loan.borrower)) return undefined;
  const borrower = loan.borrower;
  const defaults = world.loans.filter(
    (l) => l.borrower === borrower && l.status === "defaulted",
  ).length;
  return {
    borrower,
    creditScore: world.creditScores[borrower] ?? 0,
    balanceUsdc: world.balances[borrower] ?? "0",
    defaults,
    utilisationBps: world.treasury.utilisationBps,
    baseRateBps: world.treasury.baseRateBps,
    requestedUsdc: loan.principalUsdc,
    rulesDecision: rulesLoanDecision(world, loan),
  };
}

/** Treasurer loan overlay. No-op when flag off, no provider, or no pending loan. */
export async function overlayTreasurerLoanAdvice(
  actions: ProposedAction[],
  world: WorldState,
  flags: AdvisorFlags,
  provider?: LlmProvider,
  timeoutMs: number = LLM_TIMEOUT_MS,
  querySubgraph?: QuerySubgraphFn,
): Promise<ProposedAction[]> {
  const loan = pendingRosterLoan(world);
  const input = advisorInputFromWorld(world);
  if (!loan || !input || !flags.llmAdvisor || !provider) return actions;
  const advice = await advise(input, flags, provider, timeoutMs, querySubgraph);
  console.log(
    `[sim] advisor ${advice.decision} max=${advice.maxAmount} source=${advice.source} ${advice.reasoning}`,
  );
  return applyAdviceToActions(actions, loan.id, advice);
}

export async function advise(
  input: AdvisorInput,
  flags: AdvisorFlags,
  provider?: LlmProvider,
  timeoutMs: number = LLM_TIMEOUT_MS,
  querySubgraph?: QuerySubgraphFn,
): Promise<AdvisorAdvice> {
  const fallback = rulesAdvice(input);
  if (!flags.llmAdvisor || !provider) return fallback;
  try {
    let history: SubgraphHistory | null = null;
    if (querySubgraph) {
      history = await querySubgraph(input.borrower);
    }
    const raw = await completeWithTimeout(provider, advisorPrompt(input, history), timeoutMs);
    return applyGuards(parseLlmJson(raw), input.rulesDecision);
  } catch {
    return fallback;
  }
}
