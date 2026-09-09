# Agent Town — Status (live)

Maintained by the Master agent. Template in [AGENT-RUNBOOK §7](AGENT-RUNBOOK.md#7-status-update-template-master-end-of-each-session).

Deadline: **Sun 13 Sep 12:00 EDT** · Code freeze **Sun 08:00** · Submit target **Sun 11:00**
Checkpoints: **Thu 10 Sep 22:00** · **Sat 12 Sep 12:00**

## Milestone board

| Milestone | State | Owner | Notes |
|---|---|---|---|
| M0 Unblock + scaffold | in_progress | both | done: M0.1 M0.2 M0.3 M0.5 M0.8 M0.6 M0.7 · M0.4 script merged, tx gated (A) · blocked: M0.9 (Graph key) · town = botanica · human: fill `.env` |
| M1 Arc treasury + Circle wallets | in_progress | BE | **M1.1 done** (#9 `f3052ac`, forge 73/73, paris, dry-run only) · **M1.3 done** (#8 `ad0c17b`) · M1.2 deploy gated (A — say `approve M1.2`) · `setup-wallets --yes` gated (B) |
| M2 ENSv2 namespace | todo | BE | |
| M3 Subgraph | in_progress | BE | **M3.1 done** (#12) · **M3.2 done** (#13 `afe81ff`, matchstick 3/3, `graph build` ok) · M3.3 waits on M1.2 treasury address (placeholder `0x000…0001`) |
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
