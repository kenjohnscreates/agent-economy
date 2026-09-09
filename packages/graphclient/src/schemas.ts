/**
 * Zod schemas for subgraph DTOs returned by @agent-town/graphclient.
 * USDC amounts use shared UsdcSchema (6-decimal integer strings).
 */
import { UsdcSchema } from "@agent-town/shared";
import { z } from "zod";

export const SubgraphAgentSchema = z.object({
  id: z.string(),
  ensName: z.string().nullable(),
  role: z.string().nullable(),
  balanceDeposited: UsdcSchema,
  loansTaken: z.number().int().nonnegative(),
  defaults: z.number().int().nonnegative(),
  jobsCompleted: z.number().int().nonnegative(),
  earned: UsdcSchema,
  spent: UsdcSchema,
});

export const SubgraphLoanSchema = z.object({
  id: z.string(),
  principal: UsdcSchema,
  rateBps: z.number().int(),
  status: z.string(),
  requestedAt: UsdcSchema,
  approvedAt: UsdcSchema.nullable(),
  repaid: UsdcSchema,
  defaultedAt: UsdcSchema.nullable(),
  borrower: z.object({
    id: z.string(),
    ensName: z.string().nullable(),
  }),
});

export const SubgraphJobSchema = z.object({
  id: z.string(),
  amount: UsdcSchema,
  status: z.string(),
  createdAt: UsdcSchema,
  settledAt: UsdcSchema.nullable(),
  client: z.object({ id: z.string(), ensName: z.string().nullable() }),
  provider: z.object({ id: z.string(), ensName: z.string().nullable() }),
});

export const AgentStateSchema = z.object({
  agent: SubgraphAgentSchema,
  loans: z.array(SubgraphLoanSchema),
  jobs: z.array(SubgraphJobSchema),
});

export const ScoreboardSchema = z.object({
  treasuryBalanceUsdc: UsdcSchema,
  outstandingUsdc: UsdcSchema,
  baseRateBps: z.number().int().nonnegative(),
  jobsCompleted: z.number().int().nonnegative(),
  loansOutstanding: z.number().int().nonnegative(),
  defaults: z.number().int().nonnegative(),
});

export const GdpPointSchema = z.object({
  timestamp: z.string(),
  gdpUsdc: UsdcSchema,
});

export const GdpSeriesSchema = z.object({
  interval: z.enum(["hour", "day"]),
  /** `townDaily` when Studio aggregation is roster-safe; `rosterPayments` when filtered client-side. */
  source: z.enum(["townDaily", "rosterPayments"]),
  points: z.array(GdpPointSchema),
});

export type SubgraphAgent = z.infer<typeof SubgraphAgentSchema>;
export type SubgraphLoan = z.infer<typeof SubgraphLoanSchema>;
export type SubgraphJob = z.infer<typeof SubgraphJobSchema>;
export type AgentState = z.infer<typeof AgentStateSchema>;
export type Scoreboard = z.infer<typeof ScoreboardSchema>;
export type GdpPoint = z.infer<typeof GdpPointSchema>;
export type GdpSeries = z.infer<typeof GdpSeriesSchema>;
