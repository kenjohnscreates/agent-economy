# @agent-town/subgraph

Indexes `TownTreasury` + ERC-8183 `AgenticCommerce` on **Arc Testnet**. Network id in the manifest is `arc-testnet` (eip155:5042002), not a made-up name (RISKS R5). Schema matches ARCHITECTURE §5 (entities + `TownStat` timeseries + `TownDaily` hour/day GDP sum). USDC amounts are 6-decimal base units (`BigInt`). Raw ERC-20 `Transfer` is not indexed (RISKS R4).

## Codegen

```bash
pnpm --filter @agent-town/subgraph codegen
```

Requires Node ≥20. Uses `@graphprotocol/graph-cli@0.98.1` (Studio-aligned) and `graph-ts@0.35.1`. Mapping bodies are empty stubs until M3.2; `graph build` is wired but Studio deploy is M3.3.

## Addresses

| Source | Address | Notes |
|---|---|---|
| TownTreasury | `0x0000000000000000000000000000000000000001` | Placeholder. Replace after M1.2 from `packages/contracts/deployments/arc-testnet.json` (M3.3). Do not invent a live address. |
| AgenticCommerce (ERC-8183) | `0x0747EEf0706327138c69792bF28Cd525089e4583` | Arc Testnet reference (proxy; ABI from implementation). |

`startBlock: 0` until a real treasury deploy is recorded.
