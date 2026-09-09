# @agent-town/subgraph

Indexes `TownTreasury` + ERC-8183 `AgenticCommerce` on **Arc Testnet**. Network id in the manifest is `arc-testnet` (eip155:5042002), not a made-up name (RISKS R5). Schema matches ARCHITECTURE §5 (entities + `TownStat` timeseries + `TownDaily` hour/day GDP sum). USDC amounts are 6-decimal base units (`BigInt`). Raw ERC-20 `Transfer` is not indexed (RISKS R4).

## Codegen

```bash
pnpm --filter @agent-town/subgraph codegen
```

Requires Node ≥20. Uses `@graphprotocol/graph-cli@0.98.1` (Studio-aligned), `graph-ts@0.35.1`, and `matchstick-as@0.6.0`.

```bash
pnpm --filter @agent-town/subgraph build
pnpm --filter @agent-town/subgraph test
```

`test` runs `graph codegen && graph test` (Matchstick). Covers `handleAgentRegistered`, `handleLoanApproved`, `handleJobCompleted`. Raw ERC-20 `Transfer` is not indexed (RISKS R4).

## Studio deploy (M3.3)

`GRAPH_API_KEY` is the Studio **query** key (gateway). Deploy uses a separate wallet **deploy key** from the subgraph page — never commit either.

1. Open [Subgraph Studio](https://thegraph.com/studio/) and connect a wallet.
2. Create subgraph slug `agent-town` (network: **Arc Testnet**).
3. From this package:

```bash
graph codegen && graph build
graph deploy agent-town --version-label 0.0.1 --deploy-key "$STUDIO_DEPLOY_KEY"
```

graph-cli 0.98.1 dropped `--studio`; default node is `https://api.studio.thegraph.com/deploy/`. Copy the printed Queries URL into local `.env` as `SUBGRAPH_URL` (not git).

## Addresses

| Source | Address | Notes |
|---|---|---|
| TownTreasury | `0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1` | Live Arc Testnet (`packages/contracts/deployments/arc-testnet.json`). Deploy tx `0x8b37c596…`, startBlock `61140537`. |
| AgenticCommerce (ERC-8183) | `0x0747EEf0706327138c69792bF28Cd525089e4583` | Arc Testnet reference (proxy; ABI from implementation). Same startBlock. |
