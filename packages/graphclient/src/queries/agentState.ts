/**
 * agentState — one agent by address or ensName with recent loans/jobs.
 * Inputs: agent key + optional limits. Outputs: validated AgentState DTO.
 */
import type { GraphQLClient } from "graphql-request";
import { createSdk } from "../sdk.js";
import { resolveAgentKey } from "../roster.js";
import { AgentStateSchema, type AgentState } from "../schemas.js";

export type AgentStateOptions = {
  recentLoans?: number;
  recentJobs?: number;
};

const DEFAULT_LOANS = 10;
const DEFAULT_JOBS = 10;

export async function agentState(
  client: GraphQLClient,
  key: string,
  options: AgentStateOptions = {},
): Promise<AgentState | null> {
  const sdk = createSdk(client);
  const { byEns, value } = resolveAgentKey(key);
  const loanLimit = options.recentLoans ?? DEFAULT_LOANS;
  const jobLimit = options.recentJobs ?? DEFAULT_JOBS;

  const agent = byEns
    ? (await sdk.AgentsByEnsName({ ensName: value })).agents[0] ?? null
    : (await sdk.AgentById({ id: value })).agent;

  if (!agent) return null;

  const address = agent.id;
  const [loansRes, jobsRes] = await Promise.all([
    sdk.AgentLoans({ borrower: address, first: loanLimit }),
    sdk.AgentJobs({ address, first: jobLimit }),
  ]);

  return AgentStateSchema.parse({
    agent,
    loans: loansRes.loans,
    jobs: jobsRes.jobs,
  });
}
