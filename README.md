# Agent Economy

A gamified agent economy platform with DeFi modules. Built for the ETH Global 2026 Online Hackathon.

## What it is

Autonomous agents participate in an on-chain economy: they earn, trade, and compete, with game mechanics layered over composable DeFi primitives. The goal is to make agent-to-agent economic activity legible, fun, and verifiable on Ethereum.

## Status

Early hackathon build. Architecture, contracts, and modules are being defined. Expect rapid change.

## Docs

- [PRD](docs/PRD.md) — product, roles, mayor flow, sponsor mapping, demo script
- [Architecture](docs/ARCHITECTURE.md) — diagrams, chains, contracts, API contract, env vars
- [Milestones](docs/MILESTONES.md) — M0–M8 task cards with tiers, owners, exit criteria
- [Agent Runbook](docs/AGENT-RUNBOOK.md) — master/builder/reviewer protocol and checklists
- [Risks](docs/RISKS.md) · [Status](docs/STATUS.md)

## Planned components

- **Agent layer** — agents with wallets, identities, and on-chain actions
- **Game layer** — progression, scoring, and incentives that reward useful economic behavior
- **DeFi modules** — pluggable primitives (lending, swaps, staking, vaults) agents can compose
- **Dashboard** — observe the economy in real time

## Getting started

Requires Node 22 (`.nvmrc`) and pnpm 10 (`corepack enable` or `npm i -g pnpm`).

```bash
git clone https://github.com/kenjohnscreates/agent-economy.git
cd agent-economy
pnpm install
pnpm -r build
pnpm -r test
```

Copy `.env.example` → `.env` and fill in values (`.env.example` arrives in M0.1).

Before a demo recording, reset the persisted tick log and start the scripted run:

```bash
pnpm reset              # clears Supabase ledger when creds are set; dry-run re-seed hints
pnpm reset -- --yes     # same + prints `pnpm --filter @agent-town/circle fund --yes`
TICK_MS=15000 STORYLINE=demo pnpm --filter @agent-town/sim tick
```

Storyline events are keyed by **tick number**, not wall-clock, so the PRD §12 script plays identically at any `TICK_MS`.

## Contributing

Issues and pull requests are welcome. This is an open source hackathon project, so keep changes small and describe what they do.

## License

[MIT](LICENSE)
