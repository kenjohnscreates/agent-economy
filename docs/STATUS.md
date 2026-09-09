# Agent Town — Status (live)

Maintained by the Master agent. Template in [AGENT-RUNBOOK §7](AGENT-RUNBOOK.md#7-status-update-template-master-end-of-each-session).

Deadline: **Sun 13 Sep 12:00 EDT** · Code freeze **Sun 08:00** · Submit target **Sun 11:00**
Checkpoints: **Thu 10 Sep 22:00** · **Sat 12 Sep 12:00**

## Milestone board

| Milestone | State | Owner | Notes |
|---|---|---|---|
| M0 Unblock + scaffold | in_progress | both | done: M0.1 M0.2 M0.3 M0.5 M0.8 · in flight: M0.6 (rev 2), M0.4 · blocked: M0.9 (Graph key) · next: M0.7 · town = botanica · human: fill `.env` |
| M1 Arc treasury + Circle wallets | todo | BE | |
| M2 ENSv2 namespace | todo | BE | |
| M3 Subgraph | todo | BE | |
| M4 Sim, agents, API | todo | BE | |
| M5 Frontend | todo | FE | can start after M0.7 |
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
In progress: M0.6 round 2 (PR #5), M0.4 register botanica.eth (T2)
BLOCKED: M0.9 — Subgraph MCP (`~/.cursor/mcp.json` → `subgraph.env.AUTH_HEADER`) holds a placeholder, every call returns `auth error: malformed API key`. Tried: 4 searches + `mcp_auth`. Needs human (gate B): create Studio API key at https://thegraph.com/studio/apikeys/, set `AUTH_HEADER=Bearer <32-hex>`, reload MCP servers; also put the same key in `.env` `GRAPH_API_KEY`. Re-spawn M0.9 after.
Blocked: M0.4 — town ENS name not chosen (asked BE)
Risks changed: R5 resolved (see RISKS.md); fallback A (Substreams) confirmed unavailable, B remains
Next up: M0.6 shared zod contract → M0.7 mock server (unblocks FE), M0.9 Signal C subgraphs, M0.4 once name chosen
Checkpoint call: none
Note for FE: `apps/web` will land as an empty placeholder in M0.5 — FE owns its scaffold; consume `packages/shared` once M0.6 merges. "mock server ready" will be posted here at M0.7.
