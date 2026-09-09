// Optional advisor tool: borrower history via @agent-town/graphclient.
// Tests inject a mock QuerySubgraphFn — this factory is CLI-only, no live queries in unit tests.
import { agentState, createGraphClient, type GraphClientConfig } from "@agent-town/graphclient";
import { ensNameFor } from "@agent-town/shared";
import type { QuerySubgraphFn, SubgraphHistory } from "./advisor.js";

function borrowerKey(borrower: string): string {
  if (borrower.includes(".")) return borrower;
  const town = process.env.ENS_TOWN_NAME?.trim() || "botanica";
  return ensNameFor(borrower, town);
}

export function createQuerySubgraph(config?: GraphClientConfig): QuerySubgraphFn {
  const client = createGraphClient(config);
  return async (borrower) => {
    const state = await agentState(client, borrowerKey(borrower));
    if (!state) return null;
    const repaidCount = state.loans.filter((l) => l.status === "repaid").length;
    const history: SubgraphHistory = {
      defaults: state.agent.defaults,
      repaidCount,
      loansTaken: state.agent.loansTaken,
      balanceDeposited: state.agent.balanceDeposited,
    };
    return history;
  };
}
