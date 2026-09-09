/**
 * Live Studio subgraph smoke test (M1 e2e evidence).
 * Skipped when SUBGRAPH_URL is unset; load env via root .env symlink.
 */
import { describe, expect, it } from "vitest";
import { createGraphClient, subgraphUrlFromEnv } from "./client.js";
import { createSdk } from "./sdk.js";
import { agentState } from "./queries/agentState.js";

const hasSubgraph = Boolean(process.env.SUBGRAPH_URL?.trim());

describe.skipIf(!hasSubgraph)("live Studio subgraph", () => {
  const client = createGraphClient({
    url: subgraphUrlFromEnv(),
    apiKey: process.env.GRAPH_API_KEY,
  });

  it("loan 1 repaid and loan 2 defaulted", async () => {
    const sdk = createSdk(client);
    const [loan1, loan2] = await Promise.all([
      sdk.LoanById({ id: "1" }),
      sdk.LoanById({ id: "2" }),
    ]);
    expect(loan1.loan?.status).toBe("repaid");
    expect(loan2.loan?.status).toBe("defaulted");
  });

  it("bo agent has ensName bo.botanica.eth", async () => {
    const state = await agentState(client, "0x337512e3f78e9ad91493a98143b511c46c3775f7");
    expect(state?.agent.ensName).toBe("bo.botanica.eth");
  });
});
