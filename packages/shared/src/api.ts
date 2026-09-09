// FROZEN FE/BE API contract — zod schemas + inferred types for every endpoint
// in ARCHITECTURE §6.3. Changing a shape needs both FE and BE ack plus a
// fixture update in the same PR (AGENT-RUNBOOK §6).
// Inputs: unknown JSON at the HTTP boundary. Outputs: parsed, typed responses.
// Money: USDC is ALWAYS a 6-decimal integer string ("3000000" = 3 USDC).
import { z } from "zod";
import { EnsReviewSchema } from "./ens.js";
import { BuildingSchema, RoleSchema } from "./roster.js";
import { ActionKindSchema, BASE_RATE_MAX_BPS, BASE_RATE_MIN_BPS } from "./rules.js";
import { StorylineModeSchema, StorylinePhaseSchema } from "./storyline.js";

// ── primitives ──────────────────────────────────────────────────────────────
/** 0x-prefixed 20-byte EVM address. */
export const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected 0x address");
/** 0x-prefixed 32-byte tx hash. */
export const TxHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected 0x tx hash");
/** USDC amount as a 6-decimal integer string; never a JS number. */
export const UsdcSchema = z.string().regex(/^\d+$/, "expected 6-dec integer string");
/** Non-negative integer tick counter. */
export const TickSchema = z.int().nonnegative();
/** Basis points as a non-negative integer. */
export const BpsSchema = z.int().nonnegative();
/** ISO-8601 timestamp (with offset/Z). */
export const IsoDateSchema = z.iso.datetime({ offset: true });
/** Fraction in [0, 1]. */
export const UnitSchema = z.number().min(0).max(1);

// ── GET /state ──────────────────────────────────────────────────────────────
export const FeatureFlagsSchema = z.object({
  llmAdvisor: z.boolean(),
  llmNarrator: z.boolean(),
  externalSignals: z.boolean(),
  storyline: StorylineModeSchema,
});
export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;

export const StateResponseSchema = z.object({
  tick: TickSchema,
  phase: StorylinePhaseSchema,
  flags: FeatureFlagsSchema,
  tickMs: z.int().positive(),
  maxTicks: z.int().positive(),
  startedAt: IsoDateSchema,
});
export type StateResponse = z.infer<typeof StateResponseSchema>;

// ── GET /agents ─────────────────────────────────────────────────────────────
export const PositionSchema = z.object({
  building: BuildingSchema,
  x: UnitSchema,
  y: UnitSchema,
});
export type Position = z.infer<typeof PositionSchema>;

export const LastDecisionSchema = z.object({
  tick: TickSchema,
  kind: ActionKindSchema,
  summary: z.string().max(200),
});
export type LastDecision = z.infer<typeof LastDecisionSchema>;

export const AgentSummarySchema = z.object({
  /** Short label, e.g. "ada". */
  name: z.string().min(1),
  /** Full ENS name, e.g. "ada.<town>.eth". */
  ensName: z.string().min(1),
  role: RoleSchema,
  arcAddress: AddressSchema,
  balanceUsdc: UsdcSchema,
  creditScore: z.int().min(0).max(100).nullable(),
  position: PositionSchema,
  lastDecision: LastDecisionSchema.nullable(),
  narration: z.string().nullable(),
  /** Sprite URL or path. */
  avatar: z.string().min(1),
});
export type AgentSummary = z.infer<typeof AgentSummarySchema>;

export const AgentsResponseSchema = z.array(AgentSummarySchema);
export type AgentsResponse = z.infer<typeof AgentsResponseSchema>;

// ── loans / jobs ────────────────────────────────────────────────────────────
export const LOAN_STATUSES = ["pending", "approved", "denied", "repaid", "defaulted"] as const;
export const LoanStatusSchema = z.enum(LOAN_STATUSES);
export type LoanStatus = z.infer<typeof LoanStatusSchema>;

export const ADVISOR_DECISIONS = ["approve", "deny", "flag"] as const;
export const AdvisorDecisionSchema = z.enum(ADVISOR_DECISIONS);
export type AdvisorDecision = z.infer<typeof AdvisorDecisionSchema>;

/** Treasurer advisor verdict (ARCHITECTURE §6.2); `source` tells rules vs LLM. */
export const AdvisorVerdictSchema = z.object({
  decision: AdvisorDecisionSchema,
  reasoning: z.string(),
  confidence: UnitSchema,
  source: z.enum(["rules", "llm"]),
});
export type AdvisorVerdict = z.infer<typeof AdvisorVerdictSchema>;

export const LoanSchema = z.object({
  id: z.string().min(1),
  /** Borrower agent label. */
  borrower: z.string().min(1),
  principalUsdc: UsdcSchema,
  rateBps: BpsSchema,
  status: LoanStatusSchema,
  requestedAtTick: TickSchema,
  approvedAtTick: TickSchema.nullable(),
  repaidUsdc: UsdcSchema,
  defaultedAtTick: TickSchema.nullable(),
  advisor: AdvisorVerdictSchema.nullable(),
});
export type Loan = z.infer<typeof LoanSchema>;

export const JOB_STATUSES = ["open", "funded", "submitted", "completed", "expired"] as const;
export const JobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobSchema = z.object({
  id: z.string().min(1),
  /** Client (merchant) agent label. */
  client: z.string().min(1),
  /** Provider (worker) agent label. */
  provider: z.string().min(1),
  amountUsdc: UsdcSchema,
  status: JobStatusSchema,
  createdAtTick: TickSchema,
  settledAtTick: TickSchema.nullable(),
  tx: TxHashSchema.nullable(),
});
export type Job = z.infer<typeof JobSchema>;

// ── GET /agents/:name ───────────────────────────────────────────────────────
export const ReviewSchema = EnsReviewSchema;
export type Review = z.infer<typeof ReviewSchema>;

export const AgentLinksSchema = z.object({
  /** arcscan address page. */
  arcscan: z.url(),
  /** ENS app / resolver page for the agent name. */
  ens: z.url(),
});
export type AgentLinks = z.infer<typeof AgentLinksSchema>;

export const AgentDetailResponseSchema = AgentSummarySchema.extend({
  loans: z.array(LoanSchema),
  jobs: z.array(JobSchema),
  reviews: z.array(ReviewSchema),
  links: AgentLinksSchema,
});
export type AgentDetailResponse = z.infer<typeof AgentDetailResponseSchema>;

// ── GET /scoreboard ─────────────────────────────────────────────────────────
export const SignalSourceSchema = z.object({
  subgraphId: z.string().min(1),
  name: z.string().min(1),
});
export type SignalSource = z.infer<typeof SignalSourceSchema>;

/** External Signal C snapshot (ARCHITECTURE §5.1). `stale` = last fetch failed/slow. */
export const SignalsSchema = z.object({
  usdcBorrowApyBps: BpsSchema,
  /** USD volume as a decimal string (may include fraction), never a number. */
  dexVolume24hUsd: z.string().regex(/^\d+(\.\d+)?$/),
  fetchedAt: IsoDateSchema,
  stale: z.boolean(),
  sources: z.object({
    lending: SignalSourceSchema,
    dex: SignalSourceSchema,
  }),
});
export type Signals = z.infer<typeof SignalsSchema>;

/** How the town rate stacks on the real anchor (PRD §12 Bank panel tooltip). */
export const RateBreakdownSchema = z.object({
  marketApyBps: BpsSchema,
  spreadBps: BpsSchema,
  defaultPremiumBps: BpsSchema,
  utilisationBps: BpsSchema,
  baseRateBps: BpsSchema,
  townRateBps: BpsSchema,
});
export type RateBreakdown = z.infer<typeof RateBreakdownSchema>;

export const GdpPointSchema = z.object({ tick: TickSchema, gdpUsdc: UsdcSchema });
export type GdpPoint = z.infer<typeof GdpPointSchema>;

export const ScoreboardResponseSchema = z.object({
  gdpUsdc: UsdcSchema,
  treasuryBalanceUsdc: UsdcSchema,
  outstandingUsdc: UsdcSchema,
  defaultRateBps: BpsSchema,
  baseRateBps: BpsSchema,
  ticks: TickSchema,
  jobsCompleted: z.int().nonnegative(),
  loansOutstanding: z.int().nonnegative(),
  gdpSeries: z.array(GdpPointSchema),
  signals: SignalsSchema,
  rate: RateBreakdownSchema,
});
export type ScoreboardResponse = z.infer<typeof ScoreboardResponseSchema>;

// ── GET /loans?status= ──────────────────────────────────────────────────────
export const LoansQuerySchema = z.object({ status: LoanStatusSchema.optional() });
export type LoansQuery = z.infer<typeof LoansQuerySchema>;

export const LoansResponseSchema = z.array(LoanSchema);
export type LoansResponse = z.infer<typeof LoansResponseSchema>;

// ── POST /mayor/* ───────────────────────────────────────────────────────────
export const MayorFundRequestSchema = z.object({ amountUsdc: UsdcSchema });
export type MayorFundRequest = z.infer<typeof MayorFundRequestSchema>;

export const MayorLoanDecisionRequestSchema = z.object({
  loanId: z.string().min(1),
  approve: z.boolean(),
});
export type MayorLoanDecisionRequest = z.infer<typeof MayorLoanDecisionRequestSchema>;

export const MayorRateRequestSchema = z.object({
  bps: z.int().min(BASE_RATE_MIN_BPS).max(BASE_RATE_MAX_BPS),
});
export type MayorRateRequest = z.infer<typeof MayorRateRequestSchema>;

export const TxResponseSchema = z.object({
  txHash: TxHashSchema,
  explorerUrl: z.url(),
});
export type TxResponse = z.infer<typeof TxResponseSchema>;

// ── errors ──────────────────────────────────────────────────────────────────
export const ApiErrorSchema = z.object({
  error: z.string().min(1),
  /** Machine-readable, e.g. "NOT_FOUND", "BAD_REQUEST", "TX_FAILED". */
  code: z.string().min(1),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// ── routes ──────────────────────────────────────────────────────────────────
export const API_DEFAULT_PORT = 3001 as const;

/** Path map for `apps/api` routes and FE fetchers; keep in sync with §6.3. */
export const API_ROUTES = {
  state: "/state",
  agents: "/agents",
  agent: (name: string): string => `/agents/${encodeURIComponent(name)}`,
  scoreboard: "/scoreboard",
  events: "/events",
  loans: "/loans",
  mayorFund: "/mayor/fund",
  mayorLoanDecision: "/mayor/loan-decision",
  mayorRate: "/mayor/rate",
} as const;
