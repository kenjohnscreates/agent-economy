# Signal C — external subgraphs (M0.9)

Picked via Subgraph MCP on **2026-09-09**. Cache / stale / `EXTERNAL_SIGNALS` is **M4.9** — this file is IDs + sample queries only.

Gateway: `https://gateway.thegraph.com/api/{GRAPH_API_KEY}/subgraphs/id/{id}` (key stays in local `.env`, never git).

## Chosen IDs

| Signal | Env | Subgraph ID (public) | Display name | Schema |
|---|---|---|---|---|
| `usdcBorrowApyBps` | `EXT_LENDING_SUBGRAPH_ID` | `JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk` | Aave V3 Ethereum | Messari lending **3.1.0** (`Market` / `InterestRate`) |
| `dexVolume24hUsd` | `EXT_DEX_SUBGRAPH_ID` | `5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV` | Uniswap-V3 | Official Uniswap V3 (`Pool` / `PoolDayData`) |

Explorer:

- Lending: https://thegraph.com/explorer/subgraphs/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk
- DEX: https://thegraph.com/explorer/subgraphs/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV

## 30-day query volume

`get_deployment_30day_query_counts` was called **before** choosing. Every candidate returned `total_query_count: 0` / `data_points_count: 0` (analytics indexer empty). Ranking used `get_top_subgraph_deployments` **query fees** for the protocol contracts (live usage proxy).

### Lending (Aave V3 Pool `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2`, chain `mainnet`)

| ipfsHash | 30d MCP count | queryFeesAmount | Notes |
|---|---|---|---|
| `QmcXE5QVcBcvcaJddPxd8mFs6W9xt7STmwfgguoiM6ddAd` | **0** | **1687610153828320338701** | **chosen** — currentVersion of `JCNW…` |
| `QmSwAsLBWAijEjZp4tuUYijZSabzvrC7m3rDFs7rZH2YoN` | 0 | 660251774042359093909 | 2nd by fees |
| `Qmb2H38LmVZVLQdPCV1D9Q2a5SpTyWWg3P6DtYLmVohDnU` | 0 | 17736272724846987492 | 3rd by fees |
| `QmRjc5Dawv9vbxUZsNKakHcYV728P2NLFSBpk4MDHZpPCm` | 0 | (not in top 3) | `GXR6…` also Messari lending, same schema |
| `QmVpuZKrjhjHx2hCtpGNaW29ZYq4Xt2GyPLpiMDP2YTAHE` | 0 | — | Morpho Aave V3 (not Aave markets) |

### DEX (Uniswap V3 Factory `0x1F98431c8aD98523631AE4a59f267346ea31F984`, chain `mainnet`)

| ipfsHash | 30d MCP count | queryFeesAmount | Notes |
|---|---|---|---|
| `QmTZ8ejXJxRo7vDBS4uwqBeGoxLSWbhaA7oXa1RvxunLy7` | **0** | **220560524015274005755048** | **chosen** — currentVersion of `5zvR82…` Uniswap-V3 |
| `QmXDAaE7sT2bVe4prmZgdSXi34EGRjpULTnF9bKi3qrwFB` | 0 | 46559342979548326482160 | 2nd by fees |
| `QmZeCuoZeadgHkGwLwMeguyqUKz1WPWQYKcKyMCeQqGhsF` | 0 | 14631581459251765046556 | 3rd by fees |
| `Qmc9TiHtLDgsbgqvyfXKiyndZDnjWdrfdvETgarZbg3StY` | 0 | (not in top 3) | Messari DEX `4cKy6…` — live, not chosen (see below) |
| `QmWFi6uciaQPQmo1xRrahNwfiWLGeN9GTDJMuCfV8iVXSe` | 0 | — | Substreams Uniswap v3 Ethereum |

## Why these two

**Lending — `JCNW…`.** Search `Aave` / `Aave v3` / `Aave V3 Ethereum` / `Messari` / `lending` / `aave-v3-ethereum`. Keyword `"Messari"` returned **0** subgraphs; `"Aave V3 Ethereum"` returned this official deployment. Schema header is Messari lending 3.1.0 (`# Subgraph Schema: Lending Protocol`). Highest query-fee deployment indexing the Aave V3 Pool. Serves USDC variable borrow APY.

**DEX — `5zvR82…`.** Search `Uniswap` / `Uniswap V3 Ethereum` / `Uniswap-V3` / `Messari Uniswap`. Highest query-fee Uniswap V3 Ethereum deployment by a wide margin (R17). Official `PoolDayData.volumeUSD` is the 24h snapshot.

**Messari DEX not chosen.** `4cKy6QQMc5tpfdx8yxfYeb9TLZmgLQe44ddW1G7NwkA6` (`Uniswap V3 Ethereum`, schema DEX AMM 4.0.1) **is live** (`liquidityPoolDailySnapshots.dailyVolumeUSD` ≈ `$59,785,572` for USDC/WETH 0.05% on 2026-09-08). 30d count 0 and not in top-3 query-fee deployments, so R17 volume ranking loses to `5zvR82…`. M4.9 may switch if the Messari `liquidityPool` path is preferred over query-fee ranking.

## Schema paths (M4.9)

### `usdcBorrowApyBps`

- Entity: `market(id: aEthUSDC)` — **not** the underlying USDC address.
- USDC market id: `0x98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c` (Aave Ethereum USDC aToken).
- Underlying USDC: `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`.
- Field: `rates` where `side: BORROWER`, `type: VARIABLE` → `rate` is **percent APY** (schema: `5.21` means 5.21%).
- Convert: `usdcBorrowApyBps = round(rate * 100)` (e.g. `4.299…` → `430` bps).
- Treasurer (PRD): `baseRateBps = clamp(usdcBorrowApyBps + 200, 100, 2000)`.

### `dexVolume24hUsd`

- Pool: USDC/WETH 0.05% `0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640`.
- Field: latest `poolDayDatas.volumeUSD` (day bucket; in-progress day is partial).
- Alt (complete prior day): `first: 2`, take `date < today`.
- Official schema has no `liquidityPool`; that name is Messari DEX (`4cKy6…`).

## Sample queries + live results

Queried via `execute_query_by_subgraph_id`. `_meta.block.timestamp` is the indexer head.

### 1. `usdcBorrowApyBps` — Aave V3 Ethereum

```graphql
{
  _meta { block { number timestamp } }
  market(id: "0x98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c") {
    id
    name
    inputToken { symbol }
    rates(where: { side: BORROWER, type: VARIABLE }) {
      rate
      side
      type
    }
  }
}
```

**Returned 2026-09-09T05:29:47Z** (`_meta.block.number` `25937731`, `timestamp` `1788931787`):

| Field | Value |
|---|---|
| market.name | `Aave Ethereum USDC` |
| rates[VARIABLE BORROWER].rate | **`4.2991672066179983`** (% APY) |
| `usdcBorrowApyBps` | **`430`** (rounded) |

Protocol check: `{ protocols { name network slug type } }` → `Aave v3` / `MAINNET` / `aave-v3` / `LENDING`.

### 2. `dexVolume24hUsd` — Uniswap V3 Ethereum

```graphql
{
  _meta { block { number timestamp } }
  poolDayDatas(
    first: 1
    orderBy: date
    orderDirection: desc
    where: { pool: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640" }
  ) {
    date
    volumeUSD
    pool { id feeTier token0 { symbol } token1 { symbol } }
  }
}
```

**Returned 2026-09-09T05:29:47Z** (`_meta.block.number` `25937731`, `timestamp` `1788931787`):

| Field | Value |
|---|---|
| pool | USDC / WETH feeTier `500` |
| poolDayDatas[0].date | `1788912000` (2026-09-09T00:00:00Z, in-progress day) |
| volumeUSD | **`12706658.72996324119414257955524906`** |
| `dexVolume24hUsd` | **`12706658.73`** (USD, today-so-far) |

Prior complete day (`date` `1788825600` = 2026-09-08): `volumeUSD` **`59785652.70467572290248347563712773`**.

## Search log (MCP)

1. `search_subgraphs_by_keyword "Aave"` — V2 / L2 / liquidation; no V3 Ethereum in top results.
2. `"Aave V3 Ethereum"` → `JCNW…` (Aave V3 Ethereum), `FKe6…` (Morpho).
3. `"Messari"` / `"Messari Aave"` / `"messari-lending"` → **0**.
4. `"lending"` → unrelated (Alpaca, Size, …).
5. `"aave-v3-ethereum"` → `GXR6…` / `3kN2…` (GXR6 = Messari lending duplicate; `3kN2…` is user-history, no rates).
6. `"Uniswap"` → `5zvR82…` Uniswap-V3 plus L2s.
7. `"Uniswap V3 Ethereum"` → `HUZDs…` (substreams), `4cKy6…` (Messari DEX).
8. `"uniswap-v3-ethereum"` → several low/zero-fee copies (all 30d = 0).
9. `"Messari Uniswap"` → **0**.

Then `get_deployment_30day_query_counts` on all candidate ipfs hashes, then `get_schema_by_subgraph_id` + live queries on the winners.
