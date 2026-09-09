// @agent-town/graphclient — typed subgraph queries (graphql-request + codegen)
// for the agent-town subgraph plus external signal IDs (ARCHITECTURE §5.1).
// Reads SUBGRAPH_URL + GRAPH_API_KEY from env; never hardcode the query URL.
export const PACKAGE = "@agent-town/graphclient" as const;

export {
  AAVE_V3_ETH_USDC_MARKET_ID,
  EXT_DEX_SUBGRAPH_ID,
  EXT_LENDING_SUBGRAPH_ID,
  UNISWAP_V3_ETH_USDC_WETH_005_POOL,
} from "./external.js";

export {
  createGraphClient,
  subgraphHeaders,
  subgraphUrlFromEnv,
  type GraphClientConfig,
} from "./client.js";

export { createSdk, type GraphSdk } from "./sdk.js";

export {
  townRosterAddresses,
  normalizeAddress,
  resolveAgentKey,
  TREASURY_STATE_ID,
  OPEN_JOB_STATUSES,
} from "./roster.js";

export {
  SubgraphAgentSchema,
  SubgraphLoanSchema,
  SubgraphJobSchema,
  AgentStateSchema,
  ScoreboardSchema,
  GdpPointSchema,
  GdpSeriesSchema,
  type SubgraphAgent,
  type SubgraphLoan,
  type SubgraphJob,
  type AgentState,
  type Scoreboard,
  type GdpPoint,
  type GdpSeries,
} from "./schemas.js";

export { agentState, type AgentStateOptions } from "./queries/agentState.js";
export { openJobs, type OpenJobsOptions } from "./queries/openJobs.js";
export { loanHistory, type LoanHistoryOptions } from "./queries/loanHistory.js";
export { scoreboard } from "./queries/scoreboard.js";
export { gdpSeries, type GdpInterval, type GdpSeriesOptions } from "./queries/gdpSeries.js";

export {
  fetchExternalSignals,
  resetExternalSignalsForTests,
  createInMemorySignalCache,
  SIGNAL_SOURCES,
  type FetchExternalSignalsOptions,
  type SignalCache,
} from "./externalSignals/fetchExternalSignals.js";
