/**
 * loanHistory — loans for one borrower or all town roster borrowers.
 * Inputs: optional borrower address/ENS; Outputs: validated Loan DTOs newest first.
 */
import type { GraphQLClient } from "graphql-request";
import { createSdk } from "../sdk.js";
import { resolveAgentKey, townRosterAddresses } from "../roster.js";
import { SubgraphLoanSchema, type SubgraphLoan } from "../schemas.js";
import { z } from "zod";

export type LoanHistoryOptions = {
  borrower?: string;
  first?: number;
};

const DEFAULT_FIRST = 50;

export async function loanHistory(
  client: GraphQLClient,
  options: LoanHistoryOptions = {},
): Promise<SubgraphLoan[]> {
  const sdk = createSdk(client);
  const first = options.first ?? DEFAULT_FIRST;

  if (options.borrower) {
    const { byEns, value } = resolveAgentKey(options.borrower);
    const address = byEns
      ? (await sdk.AgentsByEnsName({ ensName: value })).agents[0]?.id
      : value;
    if (!address) return [];
    const res = await sdk.BorrowerLoans({ borrower: address, first });
    return z.array(SubgraphLoanSchema).parse(res.loans);
  }

  const roster = [...townRosterAddresses()];
  const res = await sdk.TownLoans({ roster, first });
  return z.array(SubgraphLoanSchema).parse(res.loans);
}
