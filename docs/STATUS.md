# Agent Town — Status (live)

Maintained by the Master agent. Template in [AGENT-RUNBOOK §7](AGENT-RUNBOOK.md#7-status-update-template-master-end-of-each-session).

Deadline: **Sun 13 Sep 12:00 EDT** · Code freeze **Sun 08:00** · Submit target **Sun 11:00**
Checkpoints: **Thu 10 Sep 22:00** · **Sat 12 Sep 12:00**

## Milestone board

| Milestone | State | Owner | Notes |
|---|---|---|---|
| M0 Unblock + scaffold | in_progress | both | done: M0.1 M0.2 M0.3 M0.5 M0.8 M0.6 M0.7 · M0.4 script merged, tx gated (A) · blocked: M0.9 (Graph key) · town = botanica · human: fill `.env` |
| M1 Arc treasury + Circle wallets | in_progress | BE | PR #9 M1.1 OPEN MERGEABLE unreviewed; PR #8 M1.3 OPEN CONFLICTING (rebase `.env.example`/`pnpm-lock.yaml`); M1.2 deploy + wallet create gated (A/B) |
| M2 ENSv2 namespace | todo | BE | |
| M3 Subgraph | todo | BE | |
| M4 Sim, agents, API | todo | BE | |
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
