/**
 * Signal C source metadata and empty snapshots (ARCHITECTURE §5.1).
 * Uses real subgraph IDs from M0.9; names match chosen deployments.
 */
import type { Signals } from "@agent-town/shared";
import {
  EXT_DEX_SUBGRAPH_ID,
  EXT_LENDING_SUBGRAPH_ID,
} from "../external.js";

export const SIGNAL_SOURCES = {
  lending: {
    subgraphId: EXT_LENDING_SUBGRAPH_ID,
    name: "Aave V3 Ethereum",
  },
  dex: {
    subgraphId: EXT_DEX_SUBGRAPH_ID,
    name: "Uniswap V3 Ethereum",
  },
} as const;

/** Last-resort snapshot when fetch is off/failed and nothing is cached. */
export function emptyStaleSignals(fetchedAt = new Date().toISOString()): Signals {
  return {
    usdcBorrowApyBps: 0,
    dexVolume24hUsd: "0",
    fetchedAt,
    stale: true,
    sources: { ...SIGNAL_SOURCES },
  };
}
