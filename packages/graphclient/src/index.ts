// @agent-town/graphclient — typed subgraph queries (graphql-request + codegen)
// for the agent-town subgraph plus external signals (ARCHITECTURE §5.1).
// Placeholder export only; queries land once the subgraph exists (M3).
// Signal C IDs + sample queries: ./external.ts and ../external.md (M0.9; fetch is M4.9).
export const PACKAGE = "@agent-town/graphclient" as const;
export {
  AAVE_V3_ETH_USDC_MARKET_ID,
  EXT_DEX_SUBGRAPH_ID,
  EXT_LENDING_SUBGRAPH_ID,
  UNISWAP_V3_ETH_USDC_WETH_005_POOL,
} from "./external.js";

