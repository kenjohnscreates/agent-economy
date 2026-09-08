# Agent Town — Risks & Flags (v0.1)

| ID | Risk / flag | Impact | Mitigation / fallback | Owner | Verify by |
|---|---|---|---|---|---|
| R1 | **Two‑chain split**: ENSv2 only on Sepolia; USDC/ERC‑8183/Circle only on Arc | Judges may see identity as disconnected from money | Bind via `addr(coinType 2152525650)` on every agent name; show resolution live in UI and video; explain in README diagram | BE | M2.3 |
| R2 | **Wrong ENS deployment**: must use the **frozen hackathon** Sepolia contracts (per ENS workshop), not the main beta which may change | Contracts break mid‑hack or judges can't verify | Addresses only from docs banner → hackathon branch; stored in `packages/ens/deployments.json`; no other addresses in code | BE | M0.3 |
| R3 | **Mutable token IDs** in ENSv2: tokenId changes on any role grant/revoke, expiry, re‑registration | Stale ids → failed txs | Never cache tokenId; always re‑read from registry before write; test covers post‑grant write | BE | M2.2 |
| R4 | **Arc EVM differences**: USDC is native gas with 18 decimals; 20 gwei `maxFeePerGas` floor; `address(0)` transfers revert; system emitter logs USDC transfers | Wrong amounts, failed txs, subgraph double counting | Constants in `packages/shared`; contracts parameterise decimals; subgraph ignores system‑emitter events except where intended | BE | M1.1 |
| R5 | **Arc Testnet not in Subgraph Studio** | Graph track requires live Graph provider data; mocked data disqualifies | Verify hour 1 (M0.2). Fallback A: Substreams‑powered subgraph if Arc has Firehose. Fallback B: `TownLedger.sol` mirror on Sepolia written by sim with tx proofs, indexed live by Studio (weaker; disclose in README) | BE | M0.2 |
| R6 | **Arc "Launch to Mainnet"** requires mainnet‑ready by Sep 30 | Ineligible if contracts have testnet hacks | Config‑driven addresses; deploy script parameterised by chain; no faucet logic in contracts | BE | M7 |
| R7 | **No LLM key yet** | Advisor/narrator can't run | Feature flags default `off`; rules produce reasoning text; obtain key in M0.1 | BE | M0.1 |
| R8 | **Faucet rate limits** (Circle faucet) | Not enough USDC to seed 9 wallets | Fund mayor wallet once/day; fan out; keep amounts small (e.g. 2–10 USDC per agent) | BE | M1.4 |
| R9 | **Circle wallet latency / tx polling** | Tick loop stalls | Async execution with per‑action status; tick continues; `TICK_MS` tunable; retries with backoff | BE | M4.3 |
| R10 | **LLM on camera makes a bad call** | Demo confusion | Hard caps ≤ rules max; storyline mode pins decisions where needed; fallback on timeout 8 s | BE | M4.4 |
| R11 | **FE blocked on backend** | Idle FE time | Mock server + frozen API contract in M0; FE swaps to real in M5.8 | Any | M0.7 |
| R12 | **Submission artefacts** missed: architecture diagram (Arc), 2–4 min video (Graph), functional non‑hardcoded demo (ENS), public repo, track selection | Disqualification | M7/M8 cards; `docs/SUBMISSION.md`; submit by 11:00 EDT Sun | both | M8 |
| R13 | **Sepolia gas/ETH** for record writes each tick | Run out mid‑demo | Batch ENS writes (only on repay/default); fund treasurer signer with ≥ 0.5 Sepolia ETH | BE | M2.5 |
| R14 | **Continuity vs From Scratch** eligibility | Wrong pool | Repo started Sep 8 with README only; select From Scratch everywhere; no prior code | both | M8 |
| R15 | **Scope creep** (ERC‑8004, user‑added agents, reverse names) | Miss deadline | Stretch list only after M6 exit; scope‑cut ladder in MILESTONES | Master | checkpoints |

## Verified so far (Sep 8)
- Arc docs list The Graph as an Arc indexer (Subgraphs + Explorer) — still confirm Studio network id (R5).
- Arc Testnet: chain id 5042002, RPC `https://rpc.testnet.arc.io`, viem ships `arcTestnet`.
- ERC‑8183 reference on Arc Testnet: `0x0747EEf0706327138c69792bF28Cd525089e4583`; Circle SDK blockchain id `ARC-TESTNET`, SCA wallets.
- ENSIP‑26 keys: `agent-context`, `agent-endpoint[<protocol>]`.
- Prize texts read for ENS, Arc, Graph (see PRD §7).
