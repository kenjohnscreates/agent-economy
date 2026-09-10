# Agent Town — Status (live)

Maintained by the Master agent. Template in [AGENT-RUNBOOK §7](AGENT-RUNBOOK.md#7-status-update-template-master-end-of-each-session).

Deadline: **Sun 13 Sep 12:00 EDT** · Code freeze **Sun 08:00** · Submit target **Sun 11:00**
Checkpoints: **Thu 10 Sep 22:00** · **Sat 12 Sep 12:00**

## Milestone board

| Milestone | State | Owner | Notes |
|---|---|---|---|
| M0 Unblock + scaffold | done | both | M0.1–M0.9 · **M0.4 botanica.eth REGISTERED** · **M0.9** #14 `20c2a32` Aave V3 `JCNW…` + Uni V3 `5zvR82…` |
| M1 Arc treasury + Circle wallets | done | BE | **M1.1–M1.6 LIVE** · job 185726 · loans 1 repaid / 2 defaulted · treasury `0xCE0e…FfC1` |
| M2 ENSv2 namespace | done | BE | **M2.1–M2.5 LIVE** · Registrar `0xe4A1…0f7F` · 8 names + `bank.botanica.eth` alias → ada `0x97847b3C…` |
| M3 Subgraph | done | BE | **M3.1–M3.4 LIVE** · Studio `agent-town` · query URL in local `.env` only · loans 1 repaid / 2 defaulted · graphclient #27 `c703a8a` |
| M4 Sim, agents, API | done | BE | **M4.1–M4.9 code on main** · **M4.3 LIVE** buys · **M4.6 LIVE** ENS scores · **M4.7** mayor rate LIVE · **M4.8** #34 `d1b91a6` |
| M5 Frontend | done | FE | **M5.1** #39 · **M5.2** #51 `9721597` · **M5.4** #42 · **M5.7** #47 · **M5.8** #48 · mock default |
| M6 Integration + demo | in_progress | both | **M6.1 dry-run done** · live 12-tick ×3 · **0 failed txs** on latest · **#7/#8 pending** (not approved) · M6.2 #35–#38 + **#40** |
| M7 Review + docs | in_progress | reviewer | **M7.1** #45 · **M7.1b** #46 · **M7.2** #41 · **M7.3** #43 · **M7.1c** #49 `56d9b91` |
| M8 Video + submission | in_progress | both | **M8.2a** #50 outline · map is hero (#51) · record still todo |

## Log

## Tue 8 Sep 13:00 EDT
Done: PRD v0.1 (PRD, ARCHITECTURE, MILESTONES, AGENT-RUNBOOK, RISKS, STATUS)
In progress: —
Blocked: —
Risks changed: —
Next up: M0.1 keys, M0.2 Arc‑in‑Studio check, M0.3 ENS hackathon addresses, M0.5 scaffold, M0.6/M0.7 API contract + mock (unblocks FE)
Checkpoint call: none

## Tue 8 Sep 22:00 EDT
Done: PRD v0.2 — added Signal C (real market rates/volume from public subgraphs) to scope + M0.9/M4.9; B/D moved to prioritised stretch; A rejected (R16 DeFi scan); demo walkthrough (PRD §12); sim dev controls (`--once`, `MAX_TICKS`, tick‑keyed storyline); corrected USDC decimals (ERC‑20 = 6) and `evm_version = "paris"`
In progress: —
Blocked: —
Risks changed: R4 corrected; R16, R17 added
Next up: M0 (unchanged)
Checkpoint call: none

## Tue 8 Sep 22:45 EDT
Done: M0.2 — **R5 RESOLVED**: `arc-testnet` (eip155:5042002) + `arc` mainnet in Graph networks registry with `subgraphs` service; `graph init --network arc-testnet` works. Studio-only (no rewards, no substreams). Evidence: networks-registry v0.7.119, thegraph.com/docs/en/supported-networks, docs.arc.io/arc/tools/data-indexers
Done: M0.1 `.env.example` — PR #1 merged `58b3a21` (30 vars, reviewer approved, 3 nits: port 3001 to be pinned in M0.7). **Human action open:** create accounts per PR #1 checklist (Circle key/entity secret/wallet set, Studio key, Sepolia ETH, Arc faucet, LLM key, Supabase) and fill local `.env`
Done: M0.8 Foundry init — PR #2 merged `71ae93a`; `forge test` 2/2 green on main (paris; PUSH0 scan fails under shanghai control run); OZ v5.7.0 + forge-std v1.16.2 submodules
Done: M0.5 scaffold — PR #3 merged `8eb2b9e`; `pnpm -r build/test/lint` green on main incl. contracts (shared 3/3, forge 2/2); CI workflow live
Done: M0.3 ENS hackathon addresses — PR #4 merged `2124bde`; `packages/ens/deployments.json` = 40 contracts, ensv2-hackathon-frozen (2026-09-03), 40/40 match upstream `HACKATHON_CONTRACTS`, 0/40 overlap with main beta, bytecode verified. Clients point at `UpgradableUniversalResolverProxy`. Caveat: no ABIs published for this set → M2 pins a contracts-v2 commit
Decision 23:10: town name = **botanica** (`botanica.eth`, `ada.botanica.eth`). `ENS_TOWN_NAME=botanica` set in `.env.example`. M0.4 builder spawned (script + dry-run; broadcast gated on BE approval + Sepolia signer in `.env`)
Done: M0.6 shared contract — PR #5 merged `902dd74` after 2 review rounds (blocker: ERC-8183 `rejected` status; fixed). 123 exports, 55 tests. **API contract FROZEN**; ARCHITECTURE §6.3/§4.4 aligned to field names. Note for M4.8: `LOAN_TERM_TICKS=4`+`GRACE_TICKS=2` → merchant loan (t4) defaults t10 unless storyline forces repay ≤ t10
Done: M0.7 — PR #7 merged `1fabf30`. **MOCK SERVER READY** (FE unblocked): `pnpm install && pnpm -r build && pnpm --filter @agent-town/api dev:mock` → http://localhost:3001 ; all §6.3 routes + SSE `/events`; types/fixtures from `@agent-town/shared`; `apps/api/README.md`. Reviewer conformance 39/39. Known nits for M4.7: real-mode `/events` should 501; SIGINT waits on open SSE; CORS open in mock only
In progress: M0.4 register botanica.eth — script merged `446189f` (PR #6, 2 rounds, 14 tests; selectors + commitment hash verified vs deployed bytecode). Dry-run: available ✓, 8.000021 MockUSDC/yr (auto-mint), commit window 60 s–24 h. **Broadcast pending gate A**: BE fills `.env` (`SEPOLIA_RPC_URL`, `ENS_TREASURER_PRIVATE_KEY` w/ Sepolia ETH) and approves → `pnpm --filter @agent-town/ens register-town -- --commit`, wait ≥60 s, `-- --register`
In progress: M1.1 TownTreasury.sol (T1), M1.3 Circle wrapper (T1)
BLOCKED: M0.9 — Subgraph MCP (`~/.cursor/mcp.json` → `subgraph.env.AUTH_HEADER`) holds a placeholder, every call returns `auth error: malformed API key`. Tried: 4 searches + `mcp_auth`. Needs human (gate B): create Studio API key at https://thegraph.com/studio/apikeys/, set `AUTH_HEADER=Bearer <32-hex>`, reload MCP servers; also put the same key in `.env` `GRAPH_API_KEY`. Re-spawn M0.9 after.
Risks changed: R5 resolved (see RISKS.md); fallback A (Substreams) confirmed unavailable, B remains
Next up: rebase+review PR #8, review PR #9; M0.4 broadcast (gate A); M0.9 after Graph key
Checkpoint call: none
Note for FE: **mock server ready** — `pnpm --filter @agent-town/api dev:mock` → http://localhost:3001; types from `@agent-town/shared`. Start M5.1. Never wait on chain.

## Wed 9 Sep 00:25 EDT — orchestrator handoff
Done: M0 cards except M0.4 tx + M0.9. main HEAD `715fbef`. Town = botanica. API frozen (#5 `902dd74`). Mock ready (#7 `1fabf30`).
In progress: PR #9 M1.1 OPEN MERGEABLE, 3 commits, **0 reviews** (builder finished; later usage-limit error is a false fail). PR #8 M1.3 OPEN **CONFLICTING**, 0 reviews (reviewer died on usage limit before posting). Leftover worktrees `/tmp/wt-m1-1`, `/tmp/rv-m1-3`.
Blocked: M0.4 broadcast (gate A — no `.env`); M0.9 (Graph MCP key, gate B); Circle `setup-wallets --yes` (gate B, after #8 merges); M1.2 deploy (gate A, after #9 merges).
Risks changed: —
Next up: next master rebases #8, T1-reviews #8+#9, squash-merges on VERDICT: APPROVE. Then gated items only.
Checkpoint call: none
Handoff: paste the MASTER ORCHESTRATOR prompt from chat; same protocol (worktrees, §2 briefs, §4 reviews, §7 STATUS). Do not re-ask town name.

## Wed 9 Sep 00:37 EDT
Done: M1.3 — PR #8 squash-merged `ad0c17b`. Rebased onto main (lockfile regen; kept `CIRCLE_WALLET_SET_NAME=agent-town`). T1 review [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/8#pullrequestreview-5149804947). Evidence: `pnpm --filter @agent-town/circle test` **34/34**; typecheck/build/lint green; `--dry-run` 9 SCA names on `ARC-TESTNET`, 0 API calls; without `--yes` refuses. Nits (non-blocking): README omits `pnpm -r build`; positional `wallets[i]` fallback.
In progress: PR #9 M1.1 T1 review; PR #10 M4.1 T1 review (lockfile conflict vs #8 — rebase before merge)
Blocked: M0.4 broadcast (gate A — `.env` `SEPOLIA_RPC_URL` + `ENS_TREASURER_PRIVATE_KEY` + `approve M0.4`); M0.9 (Graph key, gate B); **M1.3 wallets** `setup-wallets --yes` (gate B — say `approve M1.3 wallets`); M1.2 deploy (gate A, after #9 merges)
Risks changed: —
Next up: merge #9/#10 on APPROVE; human gates above
Checkpoint call: none

## Wed 9 Sep 00:39 EDT
Done: M4.1 — PR #10 squash-merged `8443cde` after lockfile rebase onto #8. T1 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/10#pullrequestreview-5149809489). Evidence: vitest **7/7**; `--once` → tick 1; `--ticks 5` phases boom×3,borrow×2; LLM flags default off; MemoryLedger; SQL `001_ledger.sql`. Nits: short headers; MemoryLedger tick id uniqueness; extra TICK_MS sleep after last loop tick.
In progress: PR #9 M1.1 T1 review; M4.5 narrator (T3) spawned
Blocked: M0.4 (A); M0.9 (B); M1.3 wallets (B — `approve M1.3 wallets`); M1.2 (A, after #9)
Risks changed: —
Next up: merge #9 on APPROVE → spawn M3.1 schema; M4.5 review
Checkpoint call: none

## Wed 9 Sep 00:40 EDT
Done: M1.1 — PR #9 squash-merged `f3052ac`. T1 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/9#pullrequestreview-5149818740). Evidence: `forge test` **73 passed** (2× unit incl. fuzz + 4 invariants 128k calls 0 reverts); `forge build --evm-version paris`; TownTreasury runtime 0 PUSH0; dry-run vs Arc RPC `usdcDecimals=6`, no `--broadcast`. Nits: header length; termTicks vs seconds; withdraw-only reentrancy test.
In progress: M4.5 narrator; M3.1 subgraph schema spawned
Blocked: M0.4 (A); M0.9 (B); M1.3 wallets (B — `approve M1.3 wallets`); **M1.2 first Arc deploy (A — say `approve M1.2`)**
Risks changed: —
Next up: human `approve M1.2` + `approve M1.3 wallets`; M4.5/M3.1 PRs
Checkpoint call: none

## Wed 9 Sep 00:50 EDT
Done: M3.1 — PR #12 squash-merged `c016f83`. T1 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/12#pullrequestreview-5149879998). Evidence: `graph codegen` **Types generated successfully** (graph-cli 0.98.1); `network: arc-testnet`; TownTreasury placeholder `0x000…0001` + ERC-8183 `0x0747…4583`; no USDC Transfer. Nits: extra ERC-8183 events unwired (M3.2); `startBlock: 0`.
In progress: PR #11 M4.5 T1 review; M3.2 mappings spawned
Blocked: M0.4 (A); M0.9 (B); M1.3 wallets (B); M1.2 (A)
Risks changed: —
Next up: merge #11 on APPROVE; M3.2 PR; human gates
Checkpoint call: none

## Wed 9 Sep 00:51 EDT
Done: M4.5 — PR #11 squash-merged `87f95b9`. T1 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/11#pullrequestreview-5149881728). Evidence: vitest **17/17**; 1 tick → 8 bubbles ≤120; LLM default off; timeout/error → static fallback. Nits: ledger doesn't re-clip; timeout unit 30ms not 8s wait.
In progress: M3.2 mappings
Blocked: M0.4 (A); M0.9 (B); M1.3 wallets (B — `approve M1.3 wallets`); M1.2 (A — `approve M1.2`)
Risks changed: —
Next up: M3.2 PR; human gates (unblocks M1.4/M3.3/M0.4/M2)
Checkpoint call: none

## Wed 9 Sep 01:02 EDT
Done: M3.2 — PR #13 squash-merged `afe81ff`. T1 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/13#pullrequestreview-5149953012). Evidence: Matchstick **3/3**; `graph build` ok. Agent join via `AgentRegistered`; loan SM; JobCompleted → TownStat + `job_pay`; no ERC-20 Transfer. Nits: no loan-disbursement Payment; silent skip if Job missing; BaseRateSet no snapshot.
In progress: —
Blocked: M0.4 (A); M0.9 (B); M1.3 wallets (B — `approve M1.3 wallets`); **M1.2** (A — `approve M1.2`) — also blocks M1.4/M1.6/M3.3
Risks changed: —
Next up: human gates. Code path ready: Circle wrapper, TownTreasury, sim tick+narrator, subgraph mappings.
Checkpoint call: none

## Wed 9 Sep 01:19 EDT
Done: M0.4 — **botanica.eth REGISTERED** on ENSv2 hackathon Sepolia. Owner `0xD428294070595052d9E0607f28CDf51b52156d2A` (treasurer). Gate A approved ("approve"). Evidence: commit [0x0efade58…](https://sepolia.etherscan.io/tx/0x0efade580a9b0d0f0d818a783f50e6c6f5c6c3edc6c45f6da4b70667b750af43) · mint [0xaefb7966…](https://sepolia.etherscan.io/tx/0xaefb7966070ddde8980db9772ac3aa2135dc1bd0e395c52045ac69d0a50b7c8c) · approve [0xe132b082…](https://sepolia.etherscan.io/tx/0xe132b082b24e3f2452a3c966810e728d422df2cc2aa9407f0d56631466f5a0d4) · register [0xb5f87ae2…](https://sepolia.etherscan.io/tx/0xb5f87ae2c3be83be65eef6970f95df89c6fdfcb95f9bd9ec3f8dd8f1ca962436). ETHRegistry status REGISTERED; tokenId printed not persisted (R3). Local fixes (not git): `0x` prefix on keys; `SEPOLIA_RPC_URL` → publicnode (`rpc.sepolia.org` 404).
In progress: —
Blocked: M0.9 (MCP `AUTH_HEADER` still placeholder; `.env` GRAPH_API_KEY is SET — say `graph key set` after MCP reload); M1.3 wallets (B — `CIRCLE_ENTITY_SECRET` EMPTY + `approve M1.3 wallets`); M1.2 (A — after wallets)
Risks changed: —
Next up: M2.1 script/dry-run (broadcast gated); human Circle entity secret
Checkpoint call: none

## Wed 9 Sep 01:30 EDT
Done: **approve all** — M1.3 wallets LIVE: set `949545dc-5e02-5050-8e2f-7e6bc12bfed3`, 9 SCA on ARC-TESTNET (ada treasurer `0x97847b3c015994784ae8cf776ef9a4d563618cf2`, mayor `0x52b9c05db4866da39567a4f9f06fac448ea30685`). **M1.2** TownTreasury [0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1](https://testnet.arcscan.app/address/0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1) tx [0x8b37c596…](https://testnet.arcscan.app/tx/0x8b37c5961810869c38573a9e61f8787515c718c5050877d870c7868ad0e10644) · owner EOA `0xD428…6d2A` · treasurer ada · usdcDecimals=6 · 20 gwei · paris. `deployments/arc-testnet.json` + `roster.json` committed.
In progress: M0.9 Signal C; M2.1 script; M1.4 fund
Blocked: mayor needs Arc faucet USDC/gas at `0x52b9…0685` (https://faucet.circle.com) before fan-out if deployer isn't used as source
Risks changed: —
Next up: M1.4 fund; M2.1 PR then broadcast; M3.3 pin treasury address
Checkpoint call: none

## Wed 9 Sep 01:37 EDT
Done: **M0.9** — PR #14 squash-merged `20c2a32`. T1 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/14#pullrequestreview-5150167938). Lending `JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk` (Aave V3 ETH, ~430 bps USDC variable borrow); DEX `5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV` (Uniswap V3). 30d MCP counts all 0 (analytics gap); ranked by query fees. Live queries confirmed. Local `.env` `EXT_*` set (not git). M0 board → **done**.
In progress: M2.1 #15 T1 review; M1.4 fund (no PR — worktree gone)
Blocked: —
Risks changed: R17 pick complete; cache/stale still M4.9
Next up: merge #15 → `--broadcast` M2.1; respawn M1.4 if needed; M3.3
Checkpoint call: none

## Wed 9 Sep 01:40 EDT
Done: **M2.1 LIVE** — PR #15 squash-merged `42a4191`. T1 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/15#pullrequestreview-5150184637). Broadcast 4 txs: UserRegistry proxy [0xC4f5B3aa81390932398d23D736A965cA35de40f9](https://sepolia.etherscan.io/address/0xC4f5B3aa81390932398d23D736A965cA35de40f9) ([0xb75e2030…](https://sepolia.etherscan.io/tx/0xb75e20305237826c585fb058b568dd81204bc3935ab1e130438239580aea9193)) · PermissionedResolver [0x800d27e6e8497a57C273C53c86F2ec0713CEefc8](https://sepolia.etherscan.io/address/0x800d27e6e8497a57C273C53c86F2ec0713CEefc8) ([0xeadefb91…](https://sepolia.etherscan.io/tx/0xeadefb91b2289b5472eaed6fa8ec762228c2384a491f8e1e209abce0bc0a3a3f)) · setSubregistry [0x7e4cc836…](https://sepolia.etherscan.io/tx/0x7e4cc83645583bb89ef4b1d5698707bb19e986f64e7f12532069a1ae692ff6f7) · setResolver [0x0c251d58…](https://sepolia.etherscan.io/tx/0x0c251d58fbb6b0c5d172a7f8a8ca064b8b6bc9e966cdbabeffd86d45bddcc5ad). `getSubregistry(botanica)` / `getResolver(botanica)` confirmed. `packages/ens/town.json` committed (no tokenId). Local `.env` `ENS_TOWN_*` set.
In progress: M2.2 TownRegistrar; M1.4 fund
Blocked: —
Risks changed: —
Next up: M2.2 PR; M1.4 PR → `--yes`; M3.3 pin treasury in Studio
Checkpoint call: none

## Wed 9 Sep 02:03 EDT
Done: **M2.2** — PR #17 squash-merged `8452193`. T1 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/17#pullrequestreview-5150350146). `forge test` **85/85** (12 TownRegistrar). Negative `test_WorkerCannotSetCreditScore_TreasurerCan`. Paris, no tokenId storage, deploy script dry-run only (`ALLOW_BROADCAST=true` to send).
In progress: M2.3 mint script; M1.4 Circle xfer #18; M2 registrar not yet on-chain
Blocked: live `TownRegistrar` deploy + name mints (Sepolia writes — not in original approve-all list)
Risks changed: —
Next up: merge #18 → `fund --yes`; M2.3 PR; M3.3
Checkpoint call: none

## Wed 9 Sep 02:10 EDT
Done: **M1.4 LIVE** — #16 `4557156` + Circle hotfixes #18 `1ff1479` (blockchain+tokenAddress) + #19 `aa1e0a0` (SCA `feeLevel: MEDIUM`). Native seed [0x133e2978…](https://testnet.arcscan.app/tx/0x133e2978bd76d1fb33b8bd5d97f55b7a08a3f55657e6df1318b8fff1afc08ecb) · fan-out 8 Circle transfers · ada approve [0x708df316…](https://testnet.arcscan.app/tx/0x708df3167b3a1fa451e8a18cc7f167547f3b2ec5f8890ea45e2f9e6292e2308c) · `fund(3e6)` [0x85030e4f…](https://testnet.arcscan.app/tx/0x85030e4f30e19a6d1aad3bb8c10f55e9121b34038f74b0d48b73cb2292160e9d). Balances: agents 2 USDC, mayor 0.5, treasury **3 USDC**. T3 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/19#pullrequestreview-5150402092) on #19.
In progress: M1.5 job e2e; M1.6 treasury e2e; M3.3 Studio; M2.3 mint
Blocked: —
Risks changed: —
Next up: M1.5/M1.6/M3.3 PRs; M2.3
Checkpoint call: none

## Wed 9 Sep 02:23 EDT
Done: **M3.3 pin** — PR #20 squash-merged `73ac46d`. T3 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/20#pullrequestreview-5150501177). TownTreasury `0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1` startBlock `61140537` (≤ deploy 61189689). Matchstick 3/3. **Studio deploy not done** — `GRAPH_API_KEY` is a query key; needs Studio wallet **deploy key** + slug `agent-town` (Arc Testnet). `SUBGRAPH_URL` empty.
In progress: M1.5; M1.6; M2.3 #21
Blocked: M3.3 live Studio — say `studio deploy key set` after creating https://thegraph.com/studio/ subgraph `agent-town`
Risks changed: —
Next up: M1.5/M1.6 PRs; #21 review; Studio key
Checkpoint call: none

## Wed 9 Sep 02:27 EDT
Done: **M2.3 script** — PR #21 squash-merged `8d36ede`. T2 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/21#pullrequestreview-5150532617). ENS vitest 37/37; forge 90/90. Dry-run: 8 names + addr(2152525650)/60. `--broadcast` gated on `ALLOW_BROADCAST=true`. **Names not on-chain yet.**
In progress: M1.5 #22; M1.6 #23
Blocked: M2.3 live mint — say `approve M2.3`; M3.3 Studio deploy key
Risks changed: —
Next up: #22/#23 review+`--yes`; `approve M2.3`; Studio key
Checkpoint call: none

## Wed 9 Sep 02:29 EDT
Done: **M1.5 LIVE** — PR #22 squash-merged `d33bf2b`. T1 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/22#pullrequestreview-5150536975). vitest 55/55. jobId **185726** `bo`→`dee` 0.5 USDC. createJob [0xe5067a4f…](https://testnet.arcscan.app/tx/0xe5067a4f899050ee85c4b4b35b98492a7e25413d4332b94eedb7cc30c7c677fb) · fund [0x9afb88e8…](https://testnet.arcscan.app/tx/0x9afb88e869fa675417fff8543bc05f6156820277fe3f04d7eee043b916691608) · submit [0x9e2f4529…](https://testnet.arcscan.app/tx/0x9e2f4529952e9996704ad744275d9c68827fa595f78211f7795ee072b349e2f4) · complete [0x32f6e22b…](https://testnet.arcscan.app/tx/0x32f6e22b40c83f170f92126b6a08487e9a7f2a79d993c1e4d8d751352120cdfb). Worker ERC-20 2 → **2.5 USDC**.
In progress: M1.6 #23
Blocked: M2.3 live mint (`approve M2.3`); Studio deploy key
Risks changed: —
Next up: #23 merge+`--yes`; `approve M2.3`; Studio key
Checkpoint call: none

## Wed 9 Sep 02:32 EDT
Done: **M1.6 LIVE** — PR #23 squash-merged `25102bd` (rebased onto #22). T2 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/23#pullrequestreview-5150543537). vitest 57/57. registerAgent [0xb0f06587…](https://testnet.arcscan.app/tx/0xb0f06587294bc4811afc8ff3fd52ac1f54dc67c622e1d7ac2901c8e83903cb00) · deposit 0.2 [0x13c69835…](https://testnet.arcscan.app/tx/0x13c69835f005e36a5427f1ed9a82187bdd9dd3880cbff4e689df1a9d7620c711) · requestLoan #1 [0x3e1b5819…](https://testnet.arcscan.app/tx/0x3e1b5819ccd9416c8df08e71ace9d34bf8103fa7e946f62f6509fe372adeee13) · approveLoan [0x4e460541…](https://testnet.arcscan.app/tx/0x4e460541a1dd9f985b1a7aae7649c2d837134fd3fc27ccc03ce19123ea200de3) · repay [0x2fc2528d…](https://testnet.arcscan.app/tx/0x2fc2528dbda43f5ed489dce5c8a297e359ac666739abdcd0536f0ad002604eec) · loan #2 default path · markDefault [0xc0b0575e…](https://testnet.arcscan.app/tx/0xc0b0575e8a91fa12795b5c024affbabeb8c2c5e71a559079d7f3533d7c78fa89). **M1 board → done.**
In progress: —
Blocked: M2.3 live mint (`approve M2.3`); Studio deploy key (`studio deploy key set`)
Risks changed: —
Next up: `approve M2.3`; Studio key → M3.4; M2.4/M2.5
Checkpoint call: none

## Wed 9 Sep 09:45 EDT
Done: **M2.3 LIVE** — TownRegistrar `0xe4A1Da7e9FDdcf074d9b344504C144b721Df0f7F` (Sepolia). Deploy [0x7bc6d7a4…](https://sepolia.etherscan.io/tx/0x7bc6d7a41166048ed386c535ff3f964ff8d6aceddb0b1d06a010ee96d59fa782) · registry grant [0xb768e384…](https://sepolia.etherscan.io/tx/0xb768e3840fa1f4c0eceecd01013a067178e417df390c3fd2ce07ea8247eb9547) · resolver grant [0x7b2b4755…](https://sepolia.etherscan.io/tx/0x7b2b47550b23ba0326135ef5311a024978c3980028554667b363bd5fd06f47ec) · ada register [0x00cd6065…](https://sepolia.etherscan.io/tx/0x00cd606527bbdeeabb3c41d3474244264d1a9750d1477c28a353d509c41050fc). UniversalResolverV2 `0xd26f2040d083af1cd2962ba303f4bea0c4faf142` **8/8** `ada|bo|cy|dee|eli|fay|gus|hal.botanica.eth` → Arc wallets (coinType 2152525650 and 60). tokenIds printed not persisted (R3). `packages/ens/town.json` updated. Broadcast used `--evm-version cancun` (paris sim `NotActivated` on hackathon PUSH0 proxyLogic `0x2fDCaC2F…`); Sepolia-only — never cancun for Arc.
In progress: M2.4 `bank.botanica.eth` alias; M2.5 ens client
Blocked: M3.3 Studio deploy key (`studio deploy key set`)
Risks changed: —
Next up: M2.4/M2.5 PRs; Studio key → M3.4
Checkpoint call: none

## Wed 9 Sep 10:15 EDT
Done: **M2.5** — PR #24 squash-merged `e169188`. T2 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/24#pullrequestreview-5155435040). ENS 52/52. Live `resolveAgent("ada")` → `0x97847b3C…18cF2`. Writes simulate-only unless `{broadcast:true}` + `ALLOW_BROADCAST`.
Done: **M2.4 script** — PR #25 squash-merged `3fb40be` (rebased onto #24; kept both README/index exports). T2 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/25). True inode alias: `register("bank")` + `linkToNode` (not addr copy). ens 45 then combined; forge 95. **bank.botanica.eth not on-chain yet.**
In progress: —
Blocked: M2.4 live alias — say `approve M2.4`; M3.3 Studio deploy key (`studio deploy key set`)
Risks changed: —
Next up: `approve M2.4`; Studio key → M3.4
Checkpoint call: none

## Wed 9 Sep 10:50 EDT
Done: **M2.4 LIVE** — `bank.botanica.eth` inode alias → ada. register [0x9c9f68c6…](https://sepolia.etherscan.io/tx/0x9c9f68c610f458c8769942d9cbb32da19795d0ccb9c8ebf0f9a1ddbd63be25a0) · linkToNode [0xa91aceb0…](https://sepolia.etherscan.io/tx/0xa91aceb0fba6ebb838495e50f446a0f14e73a593e7332f2d42bccaadeb7fec53). UR.resolve bank = ada Arc+60 `0x97847b3C015994784Ae8Cf776ef9a4d563618cF2`. **M2 board → done.**
In progress: M4.6 ENS side-effects spawned
Blocked: M3.3 Studio deploy key (`studio deploy key set`)
Risks changed: —
Next up: M4.6 PR; Studio key → M3.4
Checkpoint call: none

## Wed 9 Sep 11:20 EDT
Done: **M4.6 script** — PR #26 squash-merged `e0559d8`. T2 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/26#pullrequestreview-5156211997). ENS 74/74 · sim 21/21. repay +5; 1st default score **35** + review; 2nd default `revokeName`. **No live Sepolia writes yet.**
In progress: —
Blocked: M3.3 Studio deploy key (`studio deploy key set`); M4.6 live ENS writes — say `approve M4.6`
Risks changed: —
Next up: `approve M4.6`; Studio key → M3.4 (unblocks M4.9/M4.2)
Checkpoint call: none

## Wed 9 Sep 11:40 EDT
Done: **M4.6 LIVE** (score + review). bo repay → `town.credit-score` **75** [0x7ce503e7…](https://sepolia.etherscan.io/tx/0x7ce503e7741022cbb45ce6ea1958ed492e735aed43d434ba956dda4893f679d4) · review [0xa404c6c1…](https://sepolia.etherscan.io/tx/0xa404c6c1fdb18dd0519f9d6e6e881bbdf058dc6f3794204649bae2394ec7c9c2). fay 1st default → score **35** [0xfd1782ad…](https://sepolia.etherscan.io/tx/0xfd1782adc413993619f4dbdedddc281076e2e406480f6d69dc7debb10f811e65) · review `defaulted on 1 USDC, tick 7` [0xa606e5c2…](https://sepolia.etherscan.io/tx/0xa606e5c22e0031318cf3fc17f37b411c79fc013828692aceb2fb1ac8a05cf685). `resolveAgent` confirmed. **Did not revoke** a roster name (2nd default would unregister fay; demo needs 8 names). Revoke path remains simulated in tests.
In progress: —
Blocked: M3.3 Studio deploy key (`studio deploy key set`)
Risks changed: —
Next up: Studio key → M3.4 (unblocks M4.9/M4.2)
Checkpoint call: none

## Wed 9 Sep 12:05 EDT — master handoff
Reconciled: HEAD `7c7d916` on `main` == origin. 0 open PRs. 1 worktree (this). Leftover `/tmp/rv-pr25-review.md` cleaned. `.env` empty: `SUBGRAPH_URL`, `STUDIO_DEPLOY_KEY` (key absent), `SUPABASE_*`, LLM keys. Board matches live artifacts.
In progress: —
Blocked: **M3.3 Studio deploy** — human: create slug `agent-town` (Arc Testnet) at https://thegraph.com/studio/, put deploy key in local `.env` as `STUDIO_DEPLOY_KEY`, say `studio deploy key set`. Then: live `graph deploy` + write `SUBGRAPH_URL` locally → spawn M3.4 → M4.9 → M4.2. Do not wait on FE. Do not revoke roster ENS names.
Risks changed: —
Next up: `studio deploy key set`
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 12:20 EDT
Done: **M3.3 LIVE** — `graph deploy agent-town --version-label 0.0.1`. Studio https://thegraph.com/studio/subgraph/agent-town . Queries URL written to local `.env` `SUBGRAPH_URL` only (not git): `https://api.studio.thegraph.com/query/1758998/agent-town/0.0.1`. Evidence: loan **#1 repaid** / **#2 defaulted**; agent `0x3375…775f7` `ensName=bo.botanica.eth`; ada `0x97847b3C…` present; `_meta.block` ~61260314. ERC-8183 is a shared contract — jobs from other users are also indexed (filter to roster in M3.4). Python-urllib gets Cloudflare 1010; curl/browser UA works.
In progress: **M3.4** graphclient typed queries (T3) `card/m3.4-graphclient`
Blocked: M4.9/M4.2 wait on M3.4. Do not revoke roster ENS names.
Risks changed: —
Next up: M3.4 PR → review → M4.9 → M4.2
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 12:38 EDT
Done: **M3.4** — PR #27 squash-merged `c703a8a`. T1 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/27) after REQUEST_CHANGES on CI skip (`live.test.ts` threw at describe-load). CI green. Live: loan 1 repaid / 2 defaulted; `bo.botanica.eth`. **M3 board → done.**
In progress: **M4.9** Signal C fetch+cache (T2) `card/m4.9-signal-c`
Blocked: M4.2 waits on M4.9. Do not revoke roster ENS names.
Risks changed: —
Next up: M4.9 PR → M4.2 (T1)
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 12:50 EDT
Done: **M4.9** — PR #28 squash-merged `7819181`. T1 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/28). Live gateway `usdcBorrowApyBps=429`, `dexVolume24hUsd` ~65.8M, stale fallback + `EXTERNAL_SIGNALS=off`. `/scoreboard` wiring is M4.7.
In progress: **M4.2** role rules (T1) `card/m4.2-role-rules`
Blocked: M4.3 waits on M4.2. Do not revoke roster ENS names.
Risks changed: —
Next up: M4.2 PR → M4.3
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 13:10 EDT
Done: **M4.2** — PR #29 squash-merged `464ce08`. T1 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/29). decide() PRD §5; sim tests 42/42. Flag = pending.
In progress: **M4.3** Circle exec adapters (T2) `card/m4.3-exec-adapters` — **dry-run only**; live USDC tick needs `approve M4.3`
Blocked: live M4.3 tick (Gate A). Do not revoke roster ENS names.
Risks changed: —
Next up: M4.3 PR (mocked + dry-run) → `approve M4.3` for one live tick
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 13:35 EDT
Done: **M4.3** — PR #30 squash-merged `52ae0bc`. T1 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/30) after lint + fund_escrow jobId threading. Dry-run default. Live tick **not** run.
In progress: **M4.4** treasurer advisor (T1) `card/m4.4-advisor`
Blocked: **live M4.3 tick** — say `approve M4.3`. Then: `ALLOW_BROADCAST=true SIM_EXECUTE=on pnpm --filter @agent-town/sim tick -- --once --yes`
Risks changed: —
Next up: M4.4 PR; `approve M4.3` for Arc USDC tick
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 13:50 EDT
Done: **M4.4** — PR #31 squash-merged `2881f06`. T1 [VERDICT: APPROVE](https://github.com/kenjohnscreates/agent-economy/pull/31). sim **77/77**. LLM_ADVISOR default off; timeout → rules; cap + flag-wins.
In progress: —
Blocked: **live M4.3 tick** — say `approve M4.3`. Then master runs `ALLOW_BROADCAST=true SIM_EXECUTE=on pnpm --filter @agent-town/sim tick -- --once --yes`. Do not revoke roster ENS names.
Risks changed: —
Next up: `approve M4.3` → one Arc tick; then M4.7 real API
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 13:40 EDT
Done: **M4.3 LIVE** — Gate A `approve M4.3`. Tick 1 boom: **gus buy** [0xcaedb25f…](https://testnet.arcscan.app/tx/0xcaedb25ff8584590aa18878244ae3490006220f0e7bf492736f4f66875d3f755) · **hal buy** [0x14af335c…](https://testnet.arcscan.app/tx/0x14af335c26ac608fe73720b138e030976ad9f10a34bbad4f8f72b02a8b261d6d) (0.6676 USDC each → bo). Receipts `status=0x1` blocks `0x3a6d860` / `0x3a6d862`. CLI `tick` still defaults `emptyWorld` (idle) — live tick used injected ERC-20 balances + Signal C price. **Wire `getWorld` into cli.ts** so `--once --yes` works unattended.
In progress: **M4.7** real API; **cli getWorld** (T3)
Blocked: —
Risks changed: —
Next up: M4.7 PR; cli getWorld PR
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 13:55 EDT
Done: **M4.3 LIVE** — gus buy [0xcaedb25f…](https://testnet.arcscan.app/tx/0xcaedb25ff8584590aa18878244ae3490006220f0e7bf492736f4f66875d3f755) · hal buy [0x14af335c…](https://testnet.arcscan.app/tx/0x14af335c26ac608fe73720b138e030976ad9f10a34bbad4f8f72b02a8b261d6d) · receipts `0x1`. **cli getWorld** #32 `2e9f6d5`. **M4.7** — PR #33 squash-merged `3e69114` (REQUEST_CHANGES then APPROVE). Real API GETs; mayor POSTs 501 unless `ALLOW_BROADCAST=true`.
In progress: —
Blocked: —
Risks changed: —
Next up: M4.8 storyline + `pnpm reset`
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 14:20 EDT
Done: Gate A `approve`. **Mayor `setBaseRateBps(700)`** [0xa4bcd8dd…](https://testnet.arcscan.app/tx/0xa4bcd8dd1098d3a7393ffc9eff5183137ae48be920cd83311f9370a235854496). CLI `--once --yes` with getWorld: tick 1 boom, no extra buys (consumers below 2×price after prior 0.6676 USDC spends). **M4.8** — PR #34 squash-merged `d1b91a6` after REQUEST_CHANGES (mark_default once @ t7, bo repay t9, reset via sim).
In progress: —
Blocked: —
Risks changed: —
Next up: M6 integration; FE M5.8 can swap to `API_MODE=real`
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 14:25 EDT — master handoff
Reconciled: HEAD `d1b91a6` on `main` == origin. 0 open PRs. 1 worktree (this). Dirty `docs/STATUS.md` (logs through 14:20) committed this session. No leftover `/tmp/wt-*` `/tmp/rv-pr*`. Board: M0–M4 done; M5 ready (FE); **M6.1** next.
In progress: **M6.1** storyline dry-run (`STORYLINE=demo`, no `--yes`) vs fixtures / mock world
Blocked: live 12-tick storyline (Gate A — do not run unless explicitly asked). Mayor fund / loan-decision still Gate A. Do not `revokeName` roster names.
Risks changed: —
Next up: M6.1 dry-run → M6.2 P0/P1 as bugs surface; M7 when integration is green. Checkpoint Thu 10 Sep 22:00.
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 14:32 EDT
Done: STATUS catch-up `be3562e`. **M6.1 dry-run** (no `--yes`, no `ALLOW_BROADCAST`): `pnpm reset` (no-op, Supabase empty) → `STORYLINE=demo MAX_TICKS=12 tick --ticks 12` **12/12 ticks**, `execute=dry-run`. Fixture ledger beats: t1 gus/hal **buy**, t4 bo **request_loan**, t7 ada **mark_default**, t9 bo **repay** + ada **set_rate**. sim tests **88/88**.
M6.2 triage (P0/P1 only):
- **P0** worker `accept_job` only matches `status==="open"`; live/subgraph jobs after escrow are `funded`. Merchant **never emits `complete_job`** (kind exists in execute only). Workshop loop cannot settle.
- **P1** CLI logs tick/phase/forced only — dry-run is a black box.
- **P1** `patchDemoWorld` has no jobs/assignments → workers idle in dry-run.
- **P1** `set_rate` every tick 1–9 (`baseRateBps` lags computed). Live 700 vs market+spread+premium ~829 would spam rate txs on a 12-tick `--yes` (still gated).
- **P1** no pending middling-score loan at t9–10 → mayor flag beat missing (PRD §12).
In progress: **M6.2a** T1 `card/m6.2a-job-lifecycle` (accept funded + complete_job). **M6.2b** T2 `card/m6.2b-storyline-dryrun` (CLI logs + patch jobs/rate/flag loan).
Blocked: live 12-tick (Gate A). SUPABASE_* empty — reset/API ledger stay in-memory (human env, not a card).
Risks changed: —
Next up: review+merge M6.2 PRs; re-run dry-run; do not wait on FE.
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 14:45 EDT
Done: **M6.2a** #35 `a950554` T1 APPROVE. **M6.2b** #36 `9cce2dd` T1 APPROVE. sim **96/96**. CLI dry-run `--ticks 12` no `--yes`: dee **accept_job** t1 / **deliver** t2–3; t4 bo request_loan; t7 mark_default; t9 set_rate+repay; eli/fay no longer steal J-demo.
P1 remaining: `patchDemoWorld` spreads `...w.balances` **after** demo gus/hal 5 USDC → live poor wallets overwrite boom buys (CLI had **zero buys**). J-demo never `submitted` → no `complete_job`.
In progress: **M6.2c** T3 overlay-wins + submitted job
Blocked: live 12-tick (Gate A). Do not wait on FE.
Risks changed: —
Next up: merge M6.2c → re-run dry-run; mayor fund/loan-decision still gated
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 14:50 EDT
Done: **M6.2c** #37 `6da64f5` T1 APPROVE. CLI dry-run `--ticks 12` no `--yes` now plays PRD §12 beats: t1 gus/hal **buy** + dee **accept_job**; t2–3 dee **deliver**; t3 bo **complete_job** + dee **deposit**; t4 bo **request_loan**; t7 ada **mark_default**; t9 ada **set_rate** + bo **repay**. All `skipped` (dry-run). origin/main `6da64f5`. 0 open PRs. 1 worktree (this).
In progress: —
Blocked: live 12-tick / `pnpm reset --yes` wallet re-seed / mayor fund+loan-decision (Gate A). Do not `revokeName`. SUPABASE_* empty (in-memory ledger).
Risks changed: —
Next up: Checkpoint Thu 10 Sep 22:00. M7 README when you want docs parallel. Say `approve` for live 12-tick (drains USDC — do not run unless asked). FE M5.8 independent.
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 16:22 EDT
Done: Gate A `approve`. **Not** 12-tick (still needs explicit `run 12-tick`). One `STORYLINE=demo --once --yes` LIVE tick 1 boom. execute=LIVE.
- bo **post_job** job **185764** [0x2d10a247…](https://testnet.arcscan.app/tx/0x2d10a247d3c341158654a4a323c0855be0cc858b78596d5478bea7e0075e2da8)
- bo **request_loan** #**3** 1.2 USDC [0x7c057264…](https://testnet.arcscan.app/tx/0x7c05726486ffa0c1f9f7a6e38296214a990546b71547c5851de99ebce27c777e)
- cy **post_job** job **185765** [0x6c8a676a…](https://testnet.arcscan.app/tx/0x6c8a676a9233c60443d91535d3d608f31f9d1c214d31ffdcff0f4a3bc29c775b)
- cy **request_loan** #**4** 1.2 USDC [0x8b3b9e5c…](https://testnet.arcscan.app/tx/0x8b3b9e5cbf7e90282b7d85d78b11b5bcea5d7a77e121f325fe277cd216b87452)
- gus **buy** 0.6828 USDC [0xd626f3d8…](https://testnet.arcscan.app/tx/0xd626f3d8b378053cb7bac19fa06c36aea6ba61d2302115c392fa5d68631319ea)
- hal **buy** 0.6828 USDC [0x11898994…](https://testnet.arcscan.app/tx/0x11898994538b452528c6e599c0cb05bad91c7542c7d336187ee84aa8d30e0181)
- dee **accept_job** failed: fixture id `J-demo` (no digits). No ENS writes (tick 1; CLI has no `applyEnsSideEffects`).
Loans **#3/#4 pending** (ada ran before merchants). Did not fund re-seed. Did not revoke names.
In progress: **M6.2d** skip synthetic job ids on live execute (J-demo)
Blocked: 12-tick live; mayor fund / loan-decision #3/#4; `revokeName`
Risks changed: —
Next up: M6.2d PR; say `run 12-tick` for a full live demo. FE independent.
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 16:28 EDT
Done: **M6.2d** #38 `0d4a76e` T1 APPROVE — fixture `J-demo` now **skipped** on live execute (no failed Circle tx). origin/main `0d4a76e`. 0 open PRs.
In progress: —
Blocked: 12-tick live (`run 12-tick`); mayor loan-decision **#3/#4**; fund re-seed; `revokeName`
Risks changed: —
Next up: Checkpoint Thu 22:00. FE M5.8 independent.
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 16:45 EDT
Done: Pushed STATUS `f9542e0`. Gate A `approve` + **`run 12-tick`**. Circle faucet 403 (mayor/deployer). Deployer only 0.45 USDC — full `fund --yes` aborted. Top-up: bo→gus 1.1 [0xa2ea792a…](https://testnet.arcscan.app/tx/0xa2ea792a08593361cc465d36ada0a4ea86a91bab46e977efcb4414f5d9f69837) · bo→hal 1.1 [0x29d2aa7a…](https://testnet.arcscan.app/tx/0x29d2aa7a522f23e92f3e54f6e8913d6778477c0d263cbbc91885729098bf0955).
**LIVE `--ticks 12 --yes`** 12/12, `execute=LIVE` (~154 s). Complete: gus/hal **buy** t1–3; bo/cy **post_job** t1–4; ada **pay_stipend** t3+t6; dee **deposit** t3; ada **set_rate 839** [0xd0e92927…](https://testnet.arcscan.app/tx/0xd0e9292733035eb06c396ed4eebcdebc9692dec33174d1d2170276e3f3657b69). `J-demo` accept/deliver **skipped** (#38). Failed (reverts, dirty chain): request_loan t1–4 (loans **#3/#4** already pending); repay t5–9 (L-1 already repaid); mark_default t7 (loan #2 already defaulted); stipend t9+t12.
Did not revoke names. Did not mayor-approve #3/#4.
In progress: —
Blocked: faucet/deployer USDC for a clean re-seed; mayor loan-decision #3/#4 (say `approve` if you want those disbursed)
Risks changed: live storyline vs already-used loans/jobs — P1 for a clean demo reset
Next up: Checkpoint Thu 22:00. Need faucet USDC or human faucet at https://faucet.circle.com before a clean 12-tick. FE independent.
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 16:55 EDT
Done: Gate A `approve` loans **#3/#4**. Treasury liquid was 0.74 USDC (need 1.2 each) — deployer `fund(3 USDC)` [0xdee3b6cc…](https://testnet.arcscan.app/tx/0xdee3b6cc1ca147d045bbccee44b242b7f5cf3c25f79413abd622c906d2e330f9) (approve [0x43af43b7…](https://testnet.arcscan.app/tx/0x43af43b7612e9a6a9f67620e9ba329868b6b9e8c07c645202c56953c58311c5f)). ada **approveLoan #3** bo 1.2 USDC Active [0xe8e1a171…](https://testnet.arcscan.app/tx/0xe8e1a171602cb1389216ad037f0337d8f2c8426ea31293bef01b2ea11467d1c7) · **#4** cy 1.2 USDC Active [0x8a54ea68…](https://testnet.arcscan.app/tx/0x8a54ea6826798cb743faef985806c8faff82a7a84617c644db7ddaa7fde6a0c5).
In progress: —
Blocked: `revokeName` still gated
Risks changed: —
Next up: Checkpoint Thu 22:00. FE independent.
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 17:10 EDT
Done: Cleared **#3/#4** via repay (interest 0). bo repay #3 [0xa5ca8777…](https://testnet.arcscan.app/tx/0xa5ca877759f40a43838d702dac897ece2d9ba3be654912479714f28c0c295ed6) · cy repay #4 [0x3b7e9d2a…](https://testnet.arcscan.app/tx/0x3b7e9d2ade6fbaf9058cdfbf456637e3dff07643d0e6d5261b3c9636855fe6ee). Then **LIVE `--ticks 12 --yes`** 12/12. New **#5 bo / #6 cy Pending** (request_loan t1 complete). Buys: gus t1+t3, hal t3+t10; t1 hal / t2 both insufficient. Stipend t3+t6+t9 complete, t12 fail. set_rate 839 [0x2a26aa98…](https://testnet.arcscan.app/tx/0x2a26aa98eb7dd7b8a13ad8c3e0a04823a4e2ea49c2fb693cb8c2628591949afa). Still fail: repay L-1 (already repaid), mark_default #2 (already defaulted), request_loan t2–4 (active slot from #5/#6).
In progress: —
Blocked: `revokeName`; mayor approve **#5/#6** if wanted
Risks changed: —
Next up: Checkpoint Thu 22:00. Storyline still keys repay/default to L-1/L-2.
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 05:30 EDT (FE)
Done: **M5.1** apps/web on the frozen contract (branch `card/M5.1-web-plumbing`): Next 16 shell in Botanica tokens, typed API client (every response zod-parsed), SSE client + reducer + `/agents` refetch per tick, replay client + `scripts/record.ts` (fixtures/replay.json committed), placeholder sprites generated from the brand construction spec. **M5.5** scoreboard + sparkline, **M5.6** feed with arcscan links, **M5.3** minimal agent card. `typecheck/lint/test/build` green; 8 web tests.
In progress: **M5.2** map handed to Astra via `docs/ASTRA-MAP-BRIEF.md` (props contract frozen in `apps/web/components/MapSlot.tsx`).
Blocked: —
Risks changed: —
Notes for BE: mock `scoreboard.ticks` lags `/state.tick` by the fixture offset (7); FE shows `/state.tick`. `links.ens` points at the v1 app; ENSv2 explorer is `https://explorer.ens.dev/`. Approved circuit-leaf mark needed at `apps/web/public/brand/mark.png`.
Next up: M5.4 bank panel (rate breakdown tooltip + stale badge), M5.7 mayor panel, then M5.8 after M4.7.
Checkpoint call: none

## Wed 9 Sep 17:00 EDT (FE)
Done: **M5.1** landed on `card/M5.1-web-plumbing`, rebased onto main `464ce08` (after M4.9/M4.2), lockfile regenerated with pnpm 10.33.2; PR #39 open for Kenny. **M5.4** bank panel on `card/M5.4-bank-panel` (stacked on M5.1): treasury, utilisation (warn from 60%, danger at the 80% approval cap), base rate, town rate with the rate breakdown tooltip (market APY + spread + default premium = town rate, source lending subgraph + id, raw market APY, fetch time and age), STALE badge from `signals.stale`, loan book from `/loans` (all statuses, refetched per tick and on `loan_flagged`) with the advisor's reasoning, source and confidence on every decision. `lib/rate.ts` helpers unit-tested (10 tests); store keeps the whole loan book and upserts `loan_flagged` into it.
In progress: M5.2 map (Astra).
Blocked: —
Risks changed: —
Notes for BE: mock flips `signals.stale` every 7th tick, which is how the badge was screenshotted. The FE reads `rate.utilisationBps` straight from `/scoreboard`; nothing is recomputed client-side.
Next up: M5.7 mayor panel, then M5.8 swap to real now that M4.7 is on main.
Checkpoint call: none

## Wed 9 Sep 17:45 EDT
Done: Denied **#5/#6** [0xcf81d98d…](https://testnet.arcscan.app/tx/0xcf81d98d5efaba4005094aeb41548f39dc5d0c8b4e9ac6eed892341a75f147c2) / [0x55ff12b0…](https://testnet.arcscan.app/tx/0x55ff12b02040365361f4ca29103aff51ee34b0fc0c54a73915380b706efde6f3). Deployer native→gus 1.19 [0xd827fe66…](https://testnet.arcscan.app/tx/0xd827fe6646f93b44305f37a040c2f71ed3c6a9bb4dd2ef0fedd1d2508db582c0) · hal 1.69 [0xf27aa822…](https://testnet.arcscan.app/tx/0xf27aa822e177f51098354a52bd6d0415d5cf0166b4eb429a7374113c0c40b973). `fund()` 5.2 USDC [0xa6b1f2a0…](https://testnet.arcscan.app/tx/0xa6b1f2a05c7de274ff4c0f5389d8087f6037a09a7a3f6a036b10d1e950439fcc) → free 5.5 USDC.
**LIVE `--ticks 12 --yes`** 12/12, **0 failed** (local execute skip, later #40). Complete: gus/hal **buy** t1–3+t7; bo/cy **post_job** t1–4; t1 **request_loan** → **#7 bo / #8 cy Pending**; dee **deposit** t3; ada **pay_stipend** t3+t6+t9+t12; ada **set_rate** t9. Skipped: J-demo; request_loan t2–4; repay L-1; mark_default L-2. stats: loanCount 8, outstanding 0, defaults 1, rate 839, deposits 0.92, free 1.5 USDC.
Did not revoke names. Did **not** approve #7/#8.
In progress: —
Blocked: `revokeName`
Risks changed: fixture loan/job ids still do not land repay/default/job-settle on chain
Next up: Checkpoint Thu 22:00
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 19:00 EDT
Done: **M6.2e** #40 squash-merged `7220a16` T1 APPROVE — skip fixture `L-*` loan ids; skip `request_loan` when `activeLoanOf != 0`; skip approve/repay/default unless Pending/Active. sim tests 102/102.
Done: **M5.1** #39 squash-merged `535e455` T1 APPROVE after rebase onto main (STATUS keep-both). `apps/web` on main; mock `:3001` + web `:3000`. Rebased lockfile CI green.
Did not approve #7/#8. Did not edit `apps/web` beyond merge. Stretch B/D not started.
In progress: FE **M5.4** bank (branch `card/M5.4-bank-panel` on origin) · **M5.7 mayor is the PRD §8 demo gate** — do next if bank is not already in flight · M5.2 map after those · M5.8 `API_MODE=real` last
Blocked: `revokeName`
Risks changed: —
Next up: Dan: finish M5.4 if in flight, then **M5.7 mayor**, then M5.2 map. Mock stays source of truth until M5.8. Checkpoint Thu 22:00.
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 21:35 EDT
Done: **M5.4** #42 squash-merged `1a3c23a` T1 APPROVE — cherry-pick of Dan `717804c` onto main (STATUS keep-both). Web tests **18/18**, typecheck/lint green. Bank panel + rate tooltip + STALE badge + full loan book.
Done: **M7.2** #41 `c6d47ad` README + `docs/architecture.png`. **M7.3** #43 `f8790d6` `docs/SUBMISSION.md`. **CI** #44 `a78847f` — Foundry via GitHub tarball `v1.8.1` (foundryup attestation API 502/500).
M5.7 mayor brief posted on #42 (PRD §8 click). Did not approve #7/#8. Did not edit `apps/web` beyond merge. Stretch B/D not started.
In progress: FE **M5.7 mayor** · M5.2 map after that · M5.8 last · M7.1 reviewer pass
Blocked: `revokeName`
Risks changed: Foundry nightly/stable install via foundryup is down (attestation CDN); CI no longer uses that action
Next up: Dan **M5.7** — brief `docs/M5.7-MAYOR-BRIEF.md`. Checkpoint Thu 22:00. No live 12-tick unless asked. Do not start stretch B/D.
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 22:00 EDT
Done: **M7.1** #45 `090a7e8` T1 APPROVE — P0=0, secrets scan clean. **M7.1b** #46 `cad946c` T1 APPROVE — real scoreboard no longer double-counts default premium (spread = 200 bps).
Did not approve #7/#8. Did not edit `apps/web`. Stretch B/D not started.
In progress: FE **M5.7 mayor** (brief `docs/M5.7-MAYOR-BRIEF.md`)
Blocked: `revokeName`
Risks changed: —
Next up: Dan M5.7. Optional BE: live storyline ids (only if we want another 12-tick to look like §12). Checkpoint Thu 22:00.
Checkpoint call: none (Thu 10 Sep 22:00)

## Wed 9 Sep 23:10 EDT (FE)
Done: **M5.7** mayor panel on `card/M5.7-mayor-panel` off main `36b4445`: Fund (human USDC through `parseUsdc`, zero and malformed amounts rejected client-side), loan queue from `state.pendingLoans` with advisor reasoning and Approve / Deny, base rate slider 100 to 2000 bps in 10 bps steps seeded from `scoreboard.rate.baseRateBps`. Local toast stack (no library): success shows `{kind} · {txHash.slice(0,10)}…` plus the arcscan link, errors show the API message, 501 shows the ALLOW_BROADCAST wording. After a loan decision the panel calls a new `controls.refreshLoans()` in `useTown` so the row leaves the queue before the next tick. Replay mode disables every action. `lib/mayor.ts` unit-tested (5 tests, 23 web tests total). Headless mock run: fund, rate, tick 9 `L-3` approve, feed `approve_loan`, bank loan book updated, zero console errors.
In progress: M5.2 map next (`docs/ASTRA-MAP-BRIEF.md`), then M5.8 `API_MODE=real`.
Blocked: —
Risks changed: —
Next up: M5.2, then M5.8.
Checkpoint call: none

## Wed 9 Sep 23:52 EDT
Done: **M5.7** #47 squash-merged `2728989` T1 APPROVE. CI green. Mayor panel on main (fund / loan queue / rate / toasts). Did not edit `apps/web` beyond merge. Did not approve #7/#8. Stretch B/D not started.
In progress: FE **M5.2 map** (`docs/ASTRA-MAP-BRIEF.md`) · M5.8 last
Blocked: `revokeName`
Risks changed: —
Next up: Dan M5.2. Checkpoint Thu 22:00. No live 12-tick unless asked.
Checkpoint call: none (Thu 10 Sep 22:00)

## Thu 10 Sep 00:15 EDT (FE)
Done: **M5.8** on `card/M5.8-real-api` off main `4191950` (after M5.7 #47): the UI is unchanged between mock and real, only `NEXT_PUBLIC_API_URL` matters. `useTown` now loads the snapshot with backoff (1s, 2s, 4s, then 8s) while the API is unreachable or the real source answers `501 NOT_IMPLEMENTED` during warm-up, opens the stream only after the snapshot lands, fetches `/state` and `/health`, and exposes `reconnect()`. Shell: connection card (warming / unreachable / error) with retry and switch-to-replay, header chips for `api · mock|real`, advisor and Signal C flags and tick length, reconnect button beside the stream badge on `reconnecting` or `error`. Agent card: arcscan wallet link (shared `ARC_EXPLORER_URL`) and an ENS explorer link driven by `NEXT_PUBLIC_ENS_EXPLORER_URL` (template with `{name}`; defaults to the explorer root because its per-name route is not verified), `<town>` placeholder shown as the configured town. `lib/connect.ts` and `lib/links.ts` unit-tested (28 web tests). Headless: 501 warm-up retried and recovered with no reload, stream drop shows the reconnect button, unreachable card leads to replay, zero console errors. README real-mode section and card table updated.
In progress: M5.2 map (Astra, Codex) off main.
Blocked: —
Risks changed: —
Next up: this PR whenever Kenny wants it (M5.2 can land first, no shared files); M5.2 PR from Astra; real-mode smoke with Kenny's `.env` (not possible from this session).
Checkpoint call: none

## Thu 10 Sep 10:05 EDT
Done: `docs/MASTER-HANDOFF.md` for a fresh Master session. Dan opened **#48 M5.8** (CI green) while M5.2 map still has no PR — next Master T1-reviews #48; map still wanted for video.
In progress: FE **M5.2 map** · **#48 M5.8** open
Blocked: `revokeName`
Risks changed: —
Next up: new session — review #48; wait/nudge M5.2. Checkpoint Thu 22:00.
Checkpoint call: none (Thu 10 Sep 22:00)

## Thu 10 Sep 10:05 EDT
Done: `docs/MASTER-HANDOFF.md` for a fresh Master session (context was large). Dan opened **#48 M5.8** (CI green) while M5.2 map still has no PR — next Master should T1-review #48; map still wanted for video.
In progress: FE **M5.2 map** · **#48 M5.8** open
Blocked: `revokeName`
Risks changed: —
Next up: new session — review #48; wait/nudge M5.2. Checkpoint Thu 22:00.
Checkpoint call: none (Thu 10 Sep 22:00)

## Thu 10 Sep 11:04 EDT
Done: **M5.8** #48 squash-merged `3154be0` T1 APPROVE. Rebased onto `6134e89` (STATUS keep-both). Mock stays default (`API_MODE=mock`). GET 501 = warming/retry, not fake txs. Mayor 501 toast unchanged. `packages/shared` + `MapSlot` props untouched. Did not edit `apps/web` beyond merge. Did not approve #7/#8. Did not set `ALLOW_BROADCAST`. Stretch B/D not started.
In progress: FE **M5.2 map** (`docs/ASTRA-MAP-BRIEF.md`) · **M7.1c** P2 nits BE (`docs/M7.1c-P2-BRIEF.md`)
Blocked: `revokeName`
Risks changed: —
Next up: Dan M5.2 — `Read docs/ASTRA-MAP-BRIEF.md in full and build card M5.2 … branch card/M5.2-town-map off origin/main`. Checkpoint Thu 22:00. No live 12-tick unless asked.
Checkpoint call: none (Thu 10 Sep 22:00)

## Thu 10 Sep 11:12 EDT
Done: **M7.1c** #49 squash-merged `56d9b91` T1 `VERDICT: APPROVE` (self-opened — comment, not GitHub approve). CI green. F-P2-01 runbook 6-dec USDC · F-P2-02 deleted `notImplementedSource` · F-P2-04 mayor header. Skipped F-P2-03/05/06/07/08. Did not edit `apps/web`. Did not approve #7/#8. Stretch B/D not started.
In progress: FE **M5.2 map** · **M8.2a** video outline (`docs/M8.2a-VIDEO-BRIEF.md`)
Blocked: `revokeName`
Risks changed: —
Next up: Dan M5.2. Checkpoint Thu 22:00. No live 12-tick unless asked.
Checkpoint call: none (Thu 10 Sep 22:00)

## Thu 10 Sep 11:17 EDT
Done: **M8.2a** #50 squash-merged `0fd4075` T1 `VERDICT: APPROVE` (self-opened). CI green. `docs/SUBMISSION.md` filming notes: mock default, map placeholder until M5.2, mayor click on mock, live skip `L-1`/`J-demo`, no video URL. Did not edit `apps/web`. Did not approve #7/#8. Stretch B/D not started. 0 open PRs.
In progress: FE **M5.2 map** (`docs/ASTRA-MAP-BRIEF.md`) — still no PR
Blocked: `revokeName`
Risks changed: —
Next up: Dan M5.2 — `Read docs/ASTRA-MAP-BRIEF.md in full and build card M5.2 … branch card/M5.2-town-map off origin/main`. Checkpoint Thu 22:00. No live 12-tick unless asked.
Checkpoint call: none (Thu 10 Sep 22:00)

## Thu 10 Sep 14:43 EDT
Done: Check-in. `main` `1523f61` == origin. **0 open PRs.** No `card/M5.2-town-map`. Dan last FE: #48 (merged 11:04). M7.1c #49 + M8.2a #50 already on main. Did not edit `apps/web`. Did not approve #7/#8. Did not re-deploy. Stretch B/D not started.
In progress: FE **M5.2 map** — still no PR
Blocked: `revokeName` · map for video
Risks changed: map is the remaining demo-visual risk at tonight’s 22:00 checkpoint. Scope-cut ladder not applied (mayor click + mock storyline already work).
Next up: Dan M5.2. Checkpoint Thu 22:00. No live 12-tick unless asked.
Checkpoint call: none yet (due 22:00)

## Thu 10 Sep 15:04 EDT
Done: **M5.2** #51 squash-merged `9721597` T1 APPROVE. CI green. PixiJS map; `MapSlotProps`/`ZONES`/`zonePoint` unchanged; only extra dep `pixi.js@8`. Shared/api/sim/`store.ts` untouched. Did not edit `apps/web` beyond merge. Did not approve #7/#8. Did not re-deploy. Stretch B/D not started. **M5 board → done.** Video hero is now the map (`/map-demo` + live shell).
In progress: M8 record (Sun) · M6 still in_progress (fixture ids vs live)
Blocked: `revokeName`
Risks changed: map demo-risk closed. Remaining: live §12 beats still skip `L-1`/`J-demo`; video not recorded.
Next up: Checkpoint Thu 22:00. No live 12-tick unless asked. Film against mock; map is hero.
Checkpoint call: none (Thu 10 Sep 22:00)
