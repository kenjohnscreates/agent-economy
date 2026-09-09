/**
 * The Graph Network gateway client for Signal C external subgraphs.
 * Uses gateway URLs (not Studio SUBGRAPH_URL) with subgraphHeaders auth.
 */
import { GraphQLClient } from "graphql-request";
import { z } from "zod";
import {
  AAVE_V3_ETH_USDC_MARKET_ID,
  EXT_DEX_SUBGRAPH_ID,
  EXT_LENDING_SUBGRAPH_ID,
  UNISWAP_V3_ETH_USDC_WETH_005_POOL,
} from "../external.js";
import { subgraphHeaders } from "../client.js";

const GATEWAY_BASE = "https://gateway.thegraph.com/api";

const LendingQuerySchema = z.object({
  market: z
    .object({
      rates: z.array(z.object({ rate: z.union([z.number(), z.string()]) })),
    })
    .nullable(),
});

const DexQuerySchema = z.object({
  poolDayDatas: z.array(z.object({ volumeUSD: z.string() })),
});

const LENDING_QUERY = `
  query UsdcBorrowApy {
    market(id: "${AAVE_V3_ETH_USDC_MARKET_ID}") {
      rates(where: { side: BORROWER, type: VARIABLE }) {
        rate
      }
    }
  }
`;

const DEX_QUERY = `
  query DexVolume24h {
    poolDayDatas(
      first: 1
      orderBy: date
      orderDirection: desc
      where: { pool: "${UNISWAP_V3_ETH_USDC_WETH_005_POOL}" }
    ) {
      volumeUSD
    }
  }
`;

/** Gateway URL — key in path when present, else Bearer-only endpoint. */
export function gatewaySubgraphUrl(subgraphId: string, apiKey?: string): string {
  const key = apiKey?.trim();
  if (key) {
    return `${GATEWAY_BASE}/${key}/subgraphs/id/${subgraphId}`;
  }
  return `${GATEWAY_BASE}/subgraphs/id/${subgraphId}`;
}

function gatewayClient(subgraphId: string, apiKey: string, signal?: AbortSignal): GraphQLClient {
  return new GraphQLClient(gatewaySubgraphUrl(subgraphId, apiKey), {
    headers: subgraphHeaders(apiKey),
    signal,
  });
}

/** Messari lending rate (percent APY) → integer basis points. */
export function ratePercentToApyBps(rate: number | string): number {
  const n = typeof rate === "number" ? rate : Number(rate);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export async function fetchUsdcBorrowApyBps(
  apiKey: string,
  signal?: AbortSignal,
): Promise<number> {
  const client = gatewayClient(EXT_LENDING_SUBGRAPH_ID, apiKey, signal);
  const raw = await client.request<unknown>(LENDING_QUERY);
  const parsed = LendingQuerySchema.parse(raw);
  const rate = parsed.market?.rates[0]?.rate;
  if (rate === undefined) return 0;
  return ratePercentToApyBps(rate);
}

export async function fetchDexVolume24hUsd(
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const client = gatewayClient(EXT_DEX_SUBGRAPH_ID, apiKey, signal);
  const raw = await client.request<unknown>(DEX_QUERY);
  const parsed = DexQuerySchema.parse(raw);
  const volume = parsed.poolDayDatas[0]?.volumeUSD ?? "0";
  return volume.trim();
}
