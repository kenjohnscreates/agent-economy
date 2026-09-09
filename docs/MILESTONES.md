# Agent Town — Milestones & Task Cards (v0.1)

Clock: now **Tue 8 Sep 13:00 EDT** → code freeze **Sun 13 Sep 08:00 EDT** → submit **12:00 EDT**.
Owners: **BE** (onchain/backend human), **FE** (frontend human), **Any** (either). Tiers: **T1** heavy (senior model), **T2** medium, **T3** light (cheap model). See [AGENT-RUNBOOK](AGENT-RUNBOOK.md).
Rule: one PR per card; reviewer gate before merge; master updates [STATUS](STATUS.md).

Checkpoints (master decides scope cuts): **Thu 22:00**, **Sat 12:00**.

---

## M0 — Unblock + scaffold · Tue PM (3–4 h) · both

| ID | Task | Tier | Owner | Exit criteria | Deps |
|---|---|---|---|---|---|
| M0.1 | Accounts/keys: Circle Console API key + entity secret + wallet set; Subgraph Studio API key; Sepolia ETH; Arc faucet USDC; Anthropic/OpenAI key; Supabase project | T3 | BE | all in local `.env`; `.env.example` lists each | — |
| M0.2 | **Verify Arc Testnet is selectable in Subgraph Studio** (`graph init` network list / Studio dropdown). If not → RISKS R5 fallback | T3 | BE | screenshot/note in STATUS | — |
| M0.3 | Locate ENSv2 **hackathon** deployment addresses (docs banner → feature branch); save `packages/ens/deployments.json` | T3 | BE | JSON with registry, ETH registrar, UniversalResolverV2, VerifiableFactory | — |
| M0.4 | Register `<town>.eth` on hackathon deployment (commit‑reveal via ETH Registrar) | T2 | BE | name owned by treasurer signer; visible via UniversalResolverV2 | M0.3 |
| M0.5 | pnpm monorepo scaffold: apps/{web,api,sim}, packages/{contracts,subgraph,ens,circle,graphclient,shared}; lint/format; CI build | T3 | Any | `pnpm -r build` green | — |
| M0.6 | `packages/shared`: zod API schemas, event names, roster (8 agents, roles, sprites), rule constants | T2 | BE | types exported; FE compiles against them | M0.5 |
| M0.7 | Mock API server (`apps/api --mock`) serving fixtures for all endpoints + SSE | T3 | Any | FE can run full UI against mock | M0.6 |
| M0.8 | Foundry init with `evm_version = "paris"` + Arc/Sepolia RPC config; USDC = `0x3600…0000` (6 dec) in shared constants | T3 | BE | `forge test` runs; constants exported | M0.5 |
| M0.9 | Pick Signal C subgraphs via Subgraph MCP: Messari lending (Aave V3 Ethereum) + Uniswap V3 Ethereum; confirm 30‑day query volume; record IDs + sample queries in `packages/graphclient/external.md` | T3 | BE | two live queries return values | M0.1 |

**Exit M0:** FE runs against mock; every secret in `.env.example`; Arc‑on‑Graph confirmed; town name owned.

## M1 — Arc treasury + Circle wallets · Wed (8 h) · BE

| ID | Task | Tier | Exit criteria | Deps |
|---|---|---|---|---|
| M1.1 | `TownTreasury.sol` per ARCHITECTURE §4.1 incl. `registerAgent(address,string)`; events | T1 | forge tests: deposit, loan lifecycle, interest, default, rate, stipend | M0.8 |
| M1.2 | Deploy to Arc Testnet; verify on arcscan; write address to `.env` + `deployments/arc-testnet.json` | T2 | address in explorer | M1.1 |
| M1.3 | `packages/circle`: create wallet set + 9 SCA wallets on `ARC-TESTNET` (8 agents + mayor); persist ids/addresses `roster.json`; helpers `execute(fnSig, params)`, `transfer`, `waitComplete` | T1 | script prints 9 addresses | M0.1 |
| M1.4 | Fund script: faucet → mayor wallet → fan‑out USDC to agents; treasurer `fund()` | T3 | balances > 0 on arcscan | M1.2, M1.3 |
| M1.5 | ERC‑8183 job e2e via Circle wallets: create → fund escrow → submit → complete | T1 | 4 tx hashes; USDC moved to worker | M1.3, M1.4 |
| M1.6 | Treasury e2e via Circle: deposit, requestLoan, approveLoan, repay, markDefault | T2 | tx hashes for each | M1.2, M1.4 |

**Exit M1:** all treasury + job flows have tx hashes on arcscan from Circle wallets.

## M2 — ENSv2 namespace · Wed PM–Thu (8 h) · BE

| ID | Task | Tier | Exit criteria | Deps |
|---|---|---|---|---|
| M2.1 | Deploy town subregistry + PermissionedResolver via VerifiableFactory; point `<town>.eth` → subregistry/resolver | T1 | `subregistry(<town>)` returns our registry | M0.4 |
| M2.2 | `TownRegistrar.sol`: `register(label, owner, role)` with per‑role EAC (treasurer cross‑name text role; worker non‑transferable; consumer expiring) | T1 | forge tests incl. **negative** test: worker cannot set `town.credit-score` | M2.1 |
| M2.3 | Mint 8 agent subnames; set records: `addr(2152525650)`, `addr(60)`, `agent-context`, `town.role`, `avatar` | T2 | UniversalResolverV2 resolves each name → Arc wallet | M2.2, M1.3 |
| M2.4 | Record alias `bank.<town>.eth` → treasurer records | T2 | resolves identically | M2.3 |
| M2.5 | `packages/ens` client: `resolveAgent(name)`, `setCreditScore`, `appendReview`, `revokeName` (default path); never cache tokenIds | T2 | unit tests against Sepolia | M2.3 |

**Exit M2:** `worker1.<town>.eth` → Arc wallet via UniversalResolverV2; treasurer writes score; worker's attempt reverts.

## M3 — Subgraph · Thu (5 h) · BE (T2 with Subgraph Skills)

| ID | Task | Tier | Exit criteria | Deps |
|---|---|---|---|---|
| M3.1 | `schema.graphql` per ARCHITECTURE §5 (timeseries + aggregation for GDP) | T2 | `graph codegen` ok | M1.1 |
| M3.2 | Mappings for TownTreasury + ERC‑8183 events; Agent join via `AgentRegistered` | T1 | `graph build` ok; matchstick tests on 3 handlers | M3.1 |
| M3.3 | Deploy to Studio (Arc Testnet); sync; record `SUBGRAPH_URL` | T3 | query returns M1 txs | M3.2, M0.2 |
| M3.4 | `packages/graphclient`: typed queries `agentState`, `openJobs`, `loanHistory`, `scoreboard`, `gdpSeries` | T3 | codegen + 1 live test | M3.3 |

**Exit M3:** live query returns M1 data in < 30 s after tx.

## M4 — Sim, agents, API · Thu PM–Fri (12 h) · BE (+Any for T3)

| ID | Task | Tier | Exit criteria | Deps |
|---|---|---|---|---|
| M4.1 | Tick engine loop, idempotent action ledger (Supabase), feature flags, `--once`/`--ticks N`, `MAX_TICKS`, tick‑keyed storyline hooks | T2 | 5 dry ticks logged; `--once` advances exactly one | M0.6 |
| M4.2 | Role rules (consumer, merchant, worker, treasurer) per PRD §5 on subgraph signals + Signal C inputs | T1 | unit tests with fixture states | M3.4, M4.9 |
| M4.3 | Execution adapters: rules Action → Circle tx (treasury, ERC‑8183, transfers) | T2 | 1 full tick moves USDC on Arc | M1.3, M4.2 |
| M4.4 | Treasurer advisor (AI SDK; Anthropic/OpenAI), guardrails, fallback, `querySubgraph` tool | T1 | 10 decisions logged with reasoning; forced‑timeout falls back | M4.2 |
| M4.5 | Narrator: per‑agent persona speech bubble ≤ 120 chars, batched per tick | T3 | narration table filling | M4.1 |
| M4.6 | ENS side‑effects: credit score update after repay/default; review append; revoke on 2nd default | T2 | Sepolia txs | M2.5 |
| M4.7 | `apps/api` real mode: all endpoints from ARCHITECTURE §6.3 + SSE; mayor endpoints sign via treasurer/mayor Circle wallets | T2 | FE swaps mock → real with no code change | M4.3 |
| M4.8 | Storyline scheduler (`STORYLINE=demo`): boom → borrow → default → hike → recover; `pnpm reset` | T3 | scripted run reproduces | M4.3 |
| M4.9 | **Signal C** `packages/graphclient/external.ts`: `usdcBorrowApyBps`, `dexVolume24hUsd` from M0.9 subgraphs; per‑tick cache + stale fallback; surfaced on `/scoreboard.signals` | T2 | values change tick to tick; forced failure shows `stale=true` | M0.9, M3.4 |

**Exit M4:** 20+ unattended ticks; txs on Arc; subgraph reflects; SSE stream live; treasurer rate visibly tracks the real market rate.

## M5 — Frontend · Tue PM–Fri (parallel) · FE

| ID | Task | Tier | Exit criteria | Deps |
|---|---|---|---|---|
| M5.1 | App shell, theme, layout 1440×900; API client from `packages/shared` | T3 | renders against mock | M0.7 |
| M5.2 | Town map: 4 buildings, 8 sprites, movement from `position`, hover → Agent card | T2 | smooth at 60 fps | M5.1 |
| M5.3 | Agent card: ENS name, role, balance, credit score, last decision, narration, links | T3 | — | M5.1 |
| M5.4 | Bank panel: balance, utilisation, base rate, loans, advisor reasoning; rate breakdown tooltip from `/scoreboard.signals` (market APY + spread + premium, source subgraph, timestamp, `stale` badge) | T3 | — | M5.1 |
| M5.5 | Scoreboard bar + GDP sparkline | T3 | — | M5.1 |
| M5.6 | Event feed (SSE) with tx links + narration | T2 | — | M5.1 |
| M5.7 | Mayor panel: fund, loan queue approve/deny, rate slider; toasts with tx links | T2 | POSTs hit mock then real | M5.1 |
| M5.8 | Swap to real API; polish; empty/error states | T3 | zero console errors | M4.7 |

## M6 — Integration + demo scenario · Sat AM (4 h) · both

| ID | Task | Tier | Exit criteria |
|---|---|---|---|
| M6.1 | Full run on fresh DB: reset → storyline → 3‑min walkthrough | T2 | zero manual intervention |
| M6.2 | Fix list triage (master); only P0/P1 | T1 | STATUS updated |
| M6.3 | Record backup demo footage | T3 | file saved |

## M7 — Review + docs · Sat PM (4 h) · reviewer + T3

| ID | Task | Tier | Exit criteria |
|---|---|---|---|
| M7.1 | Reviewer pass: bugs, dead code, naming, comments, secrets scan | T1 | checklist in AGENT-RUNBOOK all ticked |
| M7.2 | README: run steps, `.env.example`, deployed addresses, prize mapping, diagram export (PNG of ARCHITECTURE mermaid) | T3 | fresh clone runs < 15 min |
| M7.3 | `docs/SUBMISSION.md`: per‑sponsor blurbs, track selections, links | T3 | ready to paste |

## M8 — Video + submission · Sun 08:00–12:00 · both

| ID | Task | Exit |
|---|---|---|
| M8.1 | Code freeze 08:00; tag `v0.1-ethonline` | tag pushed |
| M8.2 | Record 2–4 min video (PRD §10) | uploaded |
| M8.3 | ETHGlobal form: repo, video, tracks (Arc Agentic Economy [+ Launch], Graph AI From Scratch, ENS Best Use of ENSv2) | submitted by **11:00**, 1 h buffer |

## Stretch (only if M6 exits early; priority order)
- M9.1 **B — Circle App Kit / Gateway**: treasury wallet holds a unified USDC balance across chains, settles on Arc; show deposit from another testnet landing in the town bank. T1, ~3–5 h.
- M9.2 **D — Open deposits**: LP share accounting on `TownTreasury.deposit`; anyone (incl. the mayor) earns the interest agents pay; UI "Deposit" button. T1, ~2–3 h.
- M9.3 Mayor registers a new agent: mint subname + create Circle wallet from UI. T2.
- M9.4 ERC‑8004 registration on Arc + ENSIP‑25 `agent-registration` record loop. T2.
- M9.5 Arc mainnet deploy script dry‑run (Launch‑to‑Mainnet track). T3.
- Not planned: **A — external yield vault on Arc Testnet** (no live permissionless pool found; RISKS R16).

## Scope‑cut ladder (apply in order at checkpoints)
1. Drop narrator LLM (static persona lines).
2. Drop record aliasing + consumer expiry (keep EAC role scoping — that is the ENS core).
3. Drop advisor LLM (rules only; keep reasoning text from rules).
4. Reduce roster to 5 agents.
5. Drop mayor rate slider (keep fund + loan decision).
