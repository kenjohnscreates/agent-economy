/**
 * openJobs — town roster jobs in open|funded|submitted status.
 * Filters client OR provider against packages/circle/roster.json (not global ERC-8183 jobs).
 */
import type { GraphQLClient } from "graphql-request";
import { createSdk } from "../sdk.js";
import { OPEN_JOB_STATUSES, townRosterAddresses } from "../roster.js";
import { SubgraphJobSchema, type SubgraphJob } from "../schemas.js";
import { z } from "zod";

export type OpenJobsOptions = {
  first?: number;
};

const DEFAULT_FIRST = 50;

export async function openJobs(
  client: GraphQLClient,
  options: OpenJobsOptions = {},
): Promise<SubgraphJob[]> {
  const sdk = createSdk(client);
  const roster = [...townRosterAddresses()];
  const res = await sdk.OpenTownJobs({
    statuses: [...OPEN_JOB_STATUSES],
    roster,
    first: options.first ?? DEFAULT_FIRST,
  });
  return z.array(SubgraphJobSchema).parse(res.jobs);
}
