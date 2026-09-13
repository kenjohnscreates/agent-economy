# Botanica

**Watch your agent. Direct your agent. Own the swarm.**

A gamified agentic economy — SimCity for agents, with a **real bank**.

Play it live: **[botanica on Arc](https://agent-town-eight.vercel.app)** · Town: **`botanica.eth`**

Eight named agents live on a map. They earn, spend, and borrow **real USDC**. You watch the loop like a game. You step in as **mayor**. You mint **your own agent**, talk to it, and send it to the bank.

> A real treasury with real USDC settlement on Arc, running a simulated town economy. Every loan, payment, escrow and default is an on-chain transaction. The eight town agents are rule-bots with real Circle wallets — not LLM agents. A visitor you name can deposit Arc USDC into the bank through allowlisted chat. Agents' decisions are driven by live on-chain data from The Graph, including real DeFi market rates. The Treasury is our own contract; it is not a third-party DeFi protocol.

## Vision

**Today** the town is a playable demo of an agent economy you can *see*.

**Next** any model plugs in — Claude, GPT, or your own runtime — behind the same name, wallet, and job. Spawn **subagents as ENS subdomains**. Accrue value as a swarm. **Sell, rent, or license** the names and the work.

Identity is the asset. ENS is the namespace. Arc USDC is the money. The map is how humans stay in the loop.

| Now (ETHOnline) | Next |
|---|---|
| 8 rule-bots + 1 visitor you name | Drop in Claude / GPT / any agent |
| Chat: balance + deposit | Direct the agent in-game |
| ENS subagents (`scout.you.botanica.eth`) | Swarm that earns |
| Circle wallets + TownTreasury | Sell / rent / license the swarm |

## Play (2 minutes)

Open the [live town](https://agent-town-eight.vercel.app) at **1440×900**.

1. **Replay** — the recorded cycle (boom → borrow → default → rate hike). A recording. Money on Arc already happened.
2. **Live** → **Town data** → **Approve** the flagged loan. You are the mayor. Real Arc tx.
3. **Add your agent** — pick a name (not `ivy`). Fund Arc USDC. Chat: deposit into the town bank.

Map stays **8 sprites**. You are the **9th card**. Gateway inbound on Bank is **already settled** (not a live bridge). The 30-day payout line is **illustrative** — borrowers pay the bank; depositors are not credited that APR on-chain.

## Stacks we actually use

| Sponsor | In the demo | Why it matters |
|---|---|---|
| **Arc + Circle** | USDC, TownTreasury, jobs, gas, every agent wallet, Gateway inbound | The economy is on-chain, not a spreadsheet |
| **ENSv2** | `ada.botanica.eth` … `hal.botanica.eth`, visitor mint, subagents, credit scores | Names you can click, reputation you can read, swarm you can grow |
| **The Graph** | Custom `agent-town` subgraph + live **Aave V3** APY + **Uniswap** volume | Agents decide from real markets, not mocked candles |

Two chains on purpose: **ENS on Sepolia**, **money on Arc**. Each name carries Arc coinType `2152525650` so identity points at the USDC wallet.

## Architecture

![Agent Town system overview](docs/architecture.png)

Mermaid: [docs/ARCHITECTURE.md §1](docs/ARCHITECTURE.md#1-system-overview).

## Deployed (verify on explorers)

### Arc Testnet (`5042002`)

| Contract | Address |
|---|---|
| TownTreasury | [`0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1`](https://testnet.arcscan.app/address/0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1) |
| USDC (6 dec) | [`0x3600000000000000000000000000000000000000`](https://testnet.arcscan.app/address/0x3600000000000000000000000000000000000000) |
| ERC-8183 jobs | [`0x0747EEf0706327138c69792bF28Cd525089e4583`](https://testnet.arcscan.app/address/0x0747EEf0706327138c69792bF28Cd525089e4583) |

Gas is the **same USDC asset at 18 decimals**. Never add a wrapped token.

### ENS Sepolia (`11155111`)

| | |
|---|---|
| Registry | `0xC4f5B3aa81390932398d23D736A965cA35de40f9` |
| Resolver | `0x800d27e6e8497a57C273C53c86F2ec0713CEefc8` |
| Registrar | `0xe4A1Da7e9FDdcf074d9b344504C144b721Df0f7F` |
| UniversalResolverV2 | `0xd26f2040d083af1cd2962ba303f4bea0c4faf142` |
| Bank alias | `bank.botanica.eth` → `ada.botanica.eth` |

### Circle + Graph

| | |
|---|---|
| Wallet set | `949545dc-5e02-5050-8e2f-7e6bc12bfed3` |
| Treasurer `ada` | `0x97847b3C015994784Ae8Cf776ef9a4d563618cF2` |
| Mayor | `0x52B9c05Db4866da39567A4F9F06Fac448EA30685` |
| Studio subgraph | [`agent-town`](https://thegraph.com/studio/subgraph/agent-town) |
| Aave V3 ETH | `JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk` |
| Uniswap V3 | `5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV` |

Roster wallets: [`packages/circle/roster.json`](packages/circle/roster.json). `SUBGRAPH_URL` stays in local `.env` — not in git.

## Quick start (no secrets, &lt; 15 min)

Node **22** ([`.nvmrc`](.nvmrc)) · pnpm **10** (`corepack enable`).

```bash
git clone https://github.com/kenjohnscreates/agent-economy.git
cd agent-economy
cp .env.example .env
pnpm install
pnpm -r build
```

```bash
# terminal 1
pnpm --filter @agent-town/api dev:mock    # :3001
# terminal 2
pnpm --filter @agent-town/web dev         # :3000
```

Header **Replay** plays the fixture with no API. Mock / replay / `/map-demo` = clone and rehearsal. The prize video is **live**.

## Real mode (needs `.env`)

Copy [`.env.example`](.env.example). Fill Circle, RPCs, `SUBGRAPH_URL`, Supabase **service_role** (`sb_secret_…`, never `sb_publishable_…`).

```bash
# API_MODE=real
# Mayor click: ALLOW_BROADCAST=true
# Public mint only: ALLOW_VISITOR=true, leave ALLOW_BROADCAST unset
pnpm --filter @agent-town/api dev         # :3001
pnpm --filter @agent-town/web dev         # :3000
```

Mayor POSTs are **501** without `ALLOW_BROADCAST`. Visitor mint/chat need `ALLOW_VISITOR` or broadcast. Sim / Foundry default to dry-run (`--yes` / `--broadcast` also gated). Never commit `.env`.

## Docs

- [PRD](docs/PRD.md) · [Cycle](docs/CYCLE.md) · [Architecture](docs/ARCHITECTURE.md)
- [Submission](docs/SUBMISSION.md) · [Status](docs/STATUS.md) · [Runbook](docs/AGENT-RUNBOOK.md)

## License

[MIT](LICENSE)
