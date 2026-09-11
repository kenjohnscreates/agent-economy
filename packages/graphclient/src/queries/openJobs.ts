/**
 * openJobs / rosterJobs — town roster jobs via one OpenTownJobs query.
 * Filters client OR provider against packages/circle/roster.json (not global ERC-8183 jobs).
 */
import { JOB_STATUSES } from "@agent-town/shared";
import type { GraphQLClient } from "graphql-request";
import { createSdk } from "../sdk.js";
import { OPEN_JOB_STATUSES, townRosterAddresses } from "../roster.js";
import { SubgraphJobSchema, type SubgraphJob } from "../schemas.js";
import { z } from "zod";

export type OpenJobsOptions = {
  first?: number;
};

const DEFAULT_FIRST = 50;
/** 8 agents × 20 recent jobs (replaces 8× AgentJobs in real refresh). */
const DEFAULT_ROSTER_FIRST = 160;

async function queryTownJobs(
  client: GraphQLClient,
  statuses: readonly string[],
  first: number,
): Promise<SubgraphJob[]> {
  const sdk = createSdk(client);
  const roster = [...townRosterAddresses()];
  const res = await sdk.OpenTownJobs({
    statuses: [...statuses],
    roster,
    first,
  });
  return z.array(SubgraphJobSchema).parse(res.jobs);
}

export async function openJobs(
  client: GraphQLClient,
  options: OpenJobsOptions = {},
): Promise<SubgraphJob[]> {
  return queryTownJobs(client, OPEN_JOB_STATUSES, options.first ?? DEFAULT_FIRST);
}

/** All job statuses for one roster round-trip (M6.6). */
export async function rosterJobs(
  client: GraphQLClient,
  options: OpenJobsOptions = {},
): Promise<SubgraphJob[]> {
  return queryTownJobs(client, JOB_STATUSES, options.first ?? DEFAULT_ROSTER_FIRST);
}
