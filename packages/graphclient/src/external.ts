/**
 * Signal C external market subgraphs (ARCHITECTURE §5.1).
 *
 * IDs, 30-day volume ranking, schema paths, and sample GraphQL:
 *   packages/graphclient/external.md
 *
 * Fetch + per-tick cache + stale fallback is M4.9 — do not implement here.
 */
export const EXT_LENDING_SUBGRAPH_ID =
  "JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk" as const;

export const EXT_DEX_SUBGRAPH_ID =
  "5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV" as const;

/** Aave V3 Ethereum aEthUSDC (Messari `Market.id`). */
export const AAVE_V3_ETH_USDC_MARKET_ID =
  "0x98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c" as const;

/** Uniswap V3 Ethereum USDC/WETH 0.05% pool. */
export const UNISWAP_V3_ETH_USDC_WETH_005_POOL =
  "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640" as const;
