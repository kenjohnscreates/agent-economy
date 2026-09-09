/**
 * scoreboard — treasury totals + town roster activity counts.
 * Treasury from TreasuryState; jobs/defaults summed over roster agents only.
 */
import type { GraphQLClient } from "graphql-request";
import { createSdk } from "../sdk.js";
import { townRosterAddresses } from "../roster.js";
import { ScoreboardSchema, type Scoreboard } from "../schemas.js";

export async function scoreboard(client: GraphQLClient): Promise<Scoreboard> {
  const sdk = createSdk(client);
  const roster = [...townRosterAddresses()];

  const [treasuryRes, agentsRes, outstandingRes] = await Promise.all([
    sdk.TreasuryStateQuery(),
    sdk.RosterAgents({ roster }),
    sdk.OutstandingTownLoans({ roster }),
  ]);

  const state = treasuryRes.treasuryState;
  let jobsCompleted = 0;
  let defaults = 0;
  for (const agent of agentsRes.agents) {
    jobsCompleted += agent.jobsCompleted;
    defaults += agent.defaults;
  }

  return ScoreboardSchema.parse({
    treasuryBalanceUsdc: state?.balance ?? "0",
    outstandingUsdc: state?.outstanding ?? "0",
    baseRateBps: state?.baseRateBps ?? 0,
    jobsCompleted,
    loansOutstanding: outstandingRes.loans.length,
    defaults,
  });
}
