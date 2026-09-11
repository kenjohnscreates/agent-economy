# Agent Town — ETHOnline 2026 Submission

**One-liner:** SimCity for AI agents, with a real bank.

**Honesty statement (verbatim):**

> A real treasury with real USDC settlement on Arc, running a simulated town economy. Every loan, payment, escrow and default is an on-chain transaction; agents' decisions are driven by live on-chain data from The Graph, including real DeFi market rates. The Treasury is our own contract; it is not a third-party DeFi protocol.

**Repo:** https://github.com/kenjohnscreates/agent-economy

**Demo video:** TBD M8.2 — record **Sat 12 Sep live** (see [Video outline](#demo-video-outline) below)

---

## Track selections

Select these tracks in the ETHGlobal submission form:

- [x] **Arc — Best Agentic Economy App w/ Circle Agent Stack** *(primary)*
- [x] **Arc — Launch on Arc Testnet & Push to Mainnet** *(kept open — contracts are config-driven; mainnet not deployed this weekend)*
- [x] **The Graph — Best AI Use Case (From Scratch)**
- [x] **ENS — Best Use of ENSv2**

---

## Per-sponsor blurbs

### Arc — Best Agentic Economy App w/ Circle Agent Stack *(primary)*

Agent Town is a desktop town where eight autonomous agents earn, spend, borrow, and settle jobs with **real USDC on Arc Testnet**. Each agent is a **Circle Developer-Controlled SCA wallet** in wallet set `949545dc-5e02-5050-8e2f-7e6bc12bfed3`; the treasurer (`ada`) and mayor sign treasury and policy actions through the Circle Agent Stack. Money moves on-chain every tick: consumers pay merchants, merchants fund **ERC-8183** job escrow, workers deliver and get paid, workers deposit savings, and the **TownTreasury** contract (`0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1`) lends, collects interest, and marks defaults.

Agent decisions are not cosmetic — they follow **clear decision logic tied to real signals**: treasury utilisation, borrower credit scores, loan history from our subgraph, and live DeFi market rates (Signal C). The treasurer rules engine approves or flags loans; an optional LLM advisor explains reasoning with hard caps and rules fallback. Judges can verify every payment and loan on [arcscan](https://testnet.arcscan.app/address/0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1), watch the mayor approve a flagged loan in the UI, and see the subgraph update within seconds. This is an agentic economy app: agents hold wallets, make payments, manage risk, and settle jobs — not a static dashboard.

### Arc — Launch on Arc Testnet & Push to Mainnet

We ship a **live Arc Testnet deployment** today — TownTreasury at `0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1` with verified USDC flows — and keep the **Launch to Mainnet** track open for the Sep 30 follow-on. Contracts are **mainnet-portable by design**: addresses come from JSON env config, not hard-coded testnet branches; Foundry targets `evm_version = "paris"` for Arc EVM constraints; USDC is the canonical `0x3600…0000` ERC-20 (6 decimals, never a wrapped duplicate). Circle SCA wallets, ERC-8183 job settlement, and subgraph indexing all run against the same config surface a mainnet operator would swap. `packages/contracts/deployments/arc-testnet.json` is the single source of deployed addresses; README documents clone-to-run in under 15 minutes. We have **not** broadcast to Arc mainnet during the hackathon weekend — honest scope: testnet PoC now, config-driven path to mainnet next.

### The Graph — Best AI Use Case (From Scratch)

This repository started **8 Sep 2026** with no prior Agent Town code — eligible for **From Scratch**. The Graph is **load-bearing**, not a scoreboard garnish. Our custom **`agent-town`** subgraph on Arc Testnet (Studio slug `agent-town`, v`0.0.1`) indexes TownTreasury and ERC-8183 events; it is the agents' live decision feed (open jobs, loan history, utilisation, GDP) and powers the UI scoreboard and event feed. Separately, **Signal C** queries existing public subgraphs each tick: Messari-standardised **Aave V3 Ethereum** lending (`JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk`) for real USDC borrow APY and **Uniswap V3 Ethereum** (`5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV`) for DEX volume that drifts merchant pricing. The treasurer anchors its base rate to the real market APY plus spread; the merchant reacts to normalised volume — town decisions are tied to the real economy. The treasurer LLM advisor uses subgraph queries as a tool; automation and reasoning run on **live indexed data**, never mocked chain state. No query URL is published here (env-only); Studio page is public.

### ENS — Best Use of ENSv2

**ENSv2 is central, not cosmetic.** Town **`botanica.eth`** owns a dedicated subregistry on the Sepolia hackathon deployment. Eight agents are minted as **`ada.botanica.eth` … `hal.botanica.eth`** via our `TownRegistrar`, with **EAC role-scoped permissions**: the treasurer can write `town.credit-score` and review records across names; workers cannot escalate privileges; consumers have expiring subnames. Each agent carries **`addr(coinType 2152525650)`** binding the Sepolia name to its Arc USDC wallet, plus `addr(60)`, `town.role`, `agent-context`, and avatar text. **`bank.botanica.eth`** is a record alias to `ada` (treasurer), demonstrating agents-as-namespaces. After repay/default the treasurer updates credit scores and appends reviews on-chain — provably permissioned (worker write attempts revert). Resolution goes through **UniversalResolverV2** (`0xd26f2040d083af1cd2962ba303f4bea0c4faf142`). Nothing is hard-coded in the UI: names resolve live from ENS.

---

## Links

| Item | Value |
|---|---|
| **Repository** | https://github.com/kenjohnscreates/agent-economy |
| **TownTreasury (Arc)** | https://testnet.arcscan.app/address/0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1 |
| **USDC (Arc, 6 dec)** | https://testnet.arcscan.app/address/0x3600000000000000000000000000000000000000 |
| **ERC-8183 jobs (Arc)** | https://testnet.arcscan.app/address/0x0747EEf0706327138c69792bF28Cd525089e4583 |
| **Town ENS** | `botanica.eth` |
| **Agent names** | `ada.botanica.eth`, `bo.botanica.eth`, `cy.botanica.eth`, `dee.botanica.eth`, `eli.botanica.eth`, `fay.botanica.eth`, `gus.botanica.eth`, `hal.botanica.eth` |
| **Bank alias** | `bank.botanica.eth` → `ada.botanica.eth` |
| **ENS Registry** | `0xC4f5B3aa81390932398d23D736A965cA35de40f9` |
| **ENS Resolver** | `0x800d27e6e8497a57C273C53c86F2ec0713CEefc8` |
| **ENS Registrar** | `0xe4A1Da7e9FDdcf074d9b344504C144b721Df0f7F` |
| **UniversalResolverV2** | `0xd26f2040d083af1cd2962ba303f4bea0c4faf142` |
| **Circle wallet set** | `949545dc-5e02-5050-8e2f-7e6bc12bfed3` |
| **Treasurer (`ada`) wallet** | `0x97847b3C015994784Ae8Cf776ef9a4d563618cF2` |
| **Mayor wallet** | `0x52B9c05Db4866da39567A4F9F06Fac448EA30685` |
| **Subgraph Studio** | https://thegraph.com/studio/subgraph/agent-town |
| **Signal C — Aave V3 ETH** | https://thegraph.com/explorer/subgraphs/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk |
| **Signal C — Uniswap V3** | https://thegraph.com/explorer/subgraphs/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV |
| **Architecture diagram** | Mermaid: [docs/ARCHITECTURE.md §1](ARCHITECTURE.md#1-system-overview) · PNG: [docs/architecture.png](architecture.png) |

Canonical JSON: [`packages/ens/town.json`](../packages/ens/town.json), [`packages/contracts/deployments/arc-testnet.json`](../packages/contracts/deployments/arc-testnet.json), [`packages/circle/roster.json`](../packages/circle/roster.json).

---

## Demo walkthrough

Full judge script: [PRD §12](PRD.md#12-sample-demo-walkthrough-what-the-judge-sees) (~3 min, 12 ticks at 15 s, one mayor click).

**Flow:** boom (buys, jobs, deposits) → merchant borrows with advisor reasoning → worker defaults → rate hike + ENS review → mayor approves flagged loan → recovery. Tick-keyed storyline (`STORYLINE=demo`) replays identically at any speed.

**Live chain (film this, not mock):** M6.5 Gate A `--ticks 12 --yes` landed **cy #9 Defaulted**, **bo #10 Repaid**, buys/jobs/rate on [arcscan](https://testnet.arcscan.app/address/0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1). Mayor click is **loan #11 Pending cy** (not fixture `L-3`). Do **not** run another live 12-tick until the mayor uses #11. Fixture ids (`L-1`, `J-demo`) are still skipped on live execute. Mock / `/map-demo` / replay = rehearsal only.

---

## What we do NOT claim

- **Option A — external yield vault** on idle treasury USDC: not planned (no live permissionless pool on Arc Testnet; see [RISKS R16](RISKS.md)).
- **Stretch B (Circle App Kit / Gateway)**: authorized **Fri 11 Sep** (gus ETH-SEPOLIA Circle USDC → Gateway → TownTreasury). Not started at docs catch-up. Drop Saturday if faucet/API blocks — film Arc-only.
- **Stretch D (open public deposits)**: not started; do not start.
- **Arc mainnet deploy**: not done this weekend; contracts are mainnet-portable only.
- **Subgraph query URL**: not committed (set `SUBGRAPH_URL` locally after Studio deploy).

---

## Demo video outline

Target length 2–4 min. Beats are [PRD §10](PRD.md#10-demo-video-outline-24-min). **No video URL yet** (record **Sat 12 Sep live** / M8.2).

| Time | Beat |
|---|---|
| 0:00 | One-liner + town overview |
| 0:30 | Agent card: ENS name → Arc wallet → job history (Graph) |
| 1:00 | Merchant borrows; treasurer advisor reasoning |
| 1:45 | Worker defaults → rate hike → ENS review record written |
| 2:30 | Mayor approves loan; tx on arcscan |
| 3:00 | Architecture slide + sponsor mapping |
| 3:30 | Close |

### Filming notes (Fri 11 Sep — live, not mock)

Record against **live testnet**. Header must show `api · real`. Two terminals:

```bash
# repo-root .env: API_MODE=real  ALLOW_BROADCAST=true  SUPABASE_* filled (service_role / sb_secret_, not publishable)
pnpm --filter @agent-town/api dev         # :3001 — loads ../../.env
pnpm --filter @agent-town/web dev         # :3000
```

Mayor POSTs need `ALLOW_BROADCAST=true` or they 501. That is required for the **Approve #11** beat.

**Hero / map.** PixiJS overworld in the live shell (`:3000` → real `:3001`). `/map-demo` and header **replay** are rehearsal / fallback if testnet is down — not the prize video.

**Mayor click (PRD §8).** Approve **loan #11** (Pending cy 0.2 USDC). Toast hash must be a real [arcscan](https://testnet.arcscan.app) tx. Do **not** `markDefault` **bo**. Do **not** run another `--ticks 12 --yes` before this click (ada would auto-approve #11).

**What is already on chain (cut to explorer, do not re-run the 12-tick):** cy **#9 Defaulted** [seed approve 0x3421ad32…](https://testnet.arcscan.app/tx/0x3421ad323c32381fcbd0815b0d44cc3904f2adea706bd5ef606edd3cc0ed6940); bo **#10 Repaid**; buys, jobs, `set_rate`. Deliver re-submit bug fixed `bc6e112` (do not film pre-fix ESTIMATION_ERROR as current).

**Feed / speech.** Needs this Supabase project’s ledger. After catch-up the tables exist but are **empty** (`/health` `tick:null`) until sim writes here. Scoreboard + loan book still come from the subgraph.

**Agent cards.** Arcscan wallet + ENS explorer. Town = **botanica** — film `ada.botanica.eth` / `cy.botanica.eth`.

**Architecture slide (3:00).** ENS Sepolia names → Arc USDC + TownTreasury `0xCE0e…FfC1` → Studio subgraph `agent-town` → Signal C (Aave V3 + Uniswap V3). Optional Fri: Circle Gateway (Sepolia USDC `0x1c7D4B…7238` ≠ ENS MockUSDC). Do not paste `SUBGRAPH_URL`. Cut to [docs/architecture.png](architecture.png) / [ARCHITECTURE.md §1](ARCHITECTURE.md#1-system-overview).

Do not invent tx hashes. Do not claim a recorded file until M8.2 uploads it.
