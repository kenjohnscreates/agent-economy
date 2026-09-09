# Agent Town — Status (live)

Maintained by the Master agent. Template in [AGENT-RUNBOOK §7](AGENT-RUNBOOK.md#7-status-update-template-master-end-of-each-session).

Deadline: **Sun 13 Sep 12:00 EDT** · Code freeze **Sun 08:00** · Submit target **Sun 11:00**
Checkpoints: **Thu 10 Sep 22:00** · **Sat 12 Sep 12:00**

## Milestone board

| Milestone | State | Owner | Notes |
|---|---|---|---|
| M0 Unblock + scaffold | done | both | M0.1–M0.9 · **M0.4 botanica.eth REGISTERED** · **M0.9** #14 `20c2a32` Aave V3 `JCNW…` + Uni V3 `5zvR82…` |
| M1 Arc treasury + Circle wallets | in_progress | BE | **M1.1** #9 · **M1.3 wallets LIVE** (set `949545dc-…`, 9 SCA) · **M1.2 deployed** `0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1` · M1.4 fund in flight |
| M2 ENSv2 namespace | in_progress | BE | **M2.1 LIVE** registry `0xC4f5…40f9` resolver `0x800d…efc8` · M2.2 spawned |
| M3 Subgraph | in_progress | BE | **M3.1/M3.2 done** · M3.3 can use treasury `0xCE0e…FfC1` |
| M4 Sim, agents, API | in_progress | BE | **M4.1 done** (#10) · **M4.5 done** (#11 `87f95b9`, 17/17 tests, LLM off default) |
| M5 Frontend | ready | FE | **mock server ready (M0.7 merged 23:30)** — start M5.1 |
| M6 Integration + demo | todo | both | |
| M7 Review + docs | todo | reviewer | |
| M8 Video + submission | todo | both | |

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
