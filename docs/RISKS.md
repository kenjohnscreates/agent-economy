# Agent Town — Risks & Flags (v0.1)

| ID | Risk / flag | Impact | Mitigation / fallback | Owner | Verify by |
|---|---|---|---|---|---|
| R1 | **Two‑chain split**: ENSv2 only on Sepolia; USDC/ERC‑8183/Circle only on Arc | Judges may see identity as disconnected from money | Bind via `addr(coinType 2152525650)` on every agent name; show resolution live in UI and video; explain in README diagram | BE | M2.3 |
| R2 | **Wrong ENS deployment**: must use the **frozen hackathon** Sepolia contracts (per ENS workshop), not the main beta which may change | Contracts break mid‑hack or judges can't verify | Addresses only from docs banner → hackathon branch; stored in `packages/ens/deployments.json`; no other addresses in code | BE | M0.3 |
| R3 | **Mutable token IDs** in ENSv2: tokenId changes on any role grant/revoke, expiry, re‑registration | Stale ids → failed txs | Never cache tokenId; always re‑read from registry before write; test covers post‑grant write | BE | M2.2 |
| R4 | **Arc EVM differences**: USDC ERC‑20 interface `0x3600…0000` is **6 decimals** but native gas balance is **18 decimals** (same underlying balance); Arc lacks PUSH0 → `evm_version = "paris"`; 20 gwei `maxFeePerGas` floor; `address(0)` transfers revert; system emitter logs USDC transfers | Off‑by‑1e12 amounts, silent deploy failures, subgraph double counting | Use ERC‑20 interface only and read `decimals()`; `paris` in `foundry.toml`; constants in `packages/shared`; subgraph indexes Treasury/ERC‑8183 events, not raw USDC transfers | BE | M0.8, M1.1 |
| R5 | **Arc Testnet not in Subgraph Studio** — **RESOLVED Sep 8 22:44** (M0.2): networks registry v0.7.119 lists `arc-testnet` (eip155:5042002) and `arc` mainnet (eip155:5042) with the `subgraphs` service; `graph init --network arc-testnet` scaffolds. Studio‑only: `issuanceRewards=false`, no substreams/firehose → fallback A unavailable; only B applies if Studio breaks | Graph track requires live Graph provider data; mocked data disqualifies | Use `network: arc-testnet` in `subgraph.yaml`; query via Studio endpoint. Fallback B: `TownLedger.sol` mirror on Sepolia written by sim with tx proofs, indexed live by Studio (weaker; disclose in README) | BE | M0.2 ✅ |
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
| R16 | **No real DeFi on Arc Testnet** (scan Sep 8): Circle's lend/borrow sample uses mock USDC + cirBTC (no public faucet, Discord allocation); community ERC‑4626 `ArcUSDCVault` `0x6C13…2BFe` has owner‑injected fake yield; community UniV2 `ArcDEX` USDC/EURC `0x1A14…890E` is unaudited/thin; USYC needs 24–48 h allowlist + institutional eligibility | Option A (treasury yield) would be cosmetic or blocked | Do not build A. Real‑economy tie‑in comes from Signal C (live market rates via public subgraphs) and, if time, B (App Kit/Gateway) or D (open deposits). **M9.6 visitor `deposit(uint256)` is not D.** State honesty line from PRD §3 | BE | closed |
| R17 | **Signal C subgraph availability**: chosen external subgraphs may be slow, rate‑limited, or deprecated | Rules starve | Pick by 30‑day query volume via Subgraph MCP (M0.9); per‑tick cache + last‑known fallback + `stale` flag; `EXTERNAL_SIGNALS=off` kill switch | BE | M0.9 |
| R18 | **Dirty live ledger vs PRD §12 reset** | A from-tick-0 `pnpm reset --yes` / extra `--ticks 12 --yes` would auto-approve mayor loan **#11** and blur the Sat film | Film live on current book; mayor click = **#11**; cut to arcscan for #9 default / #10 repay; mock is rehearsal only | BE | M8.2 |

## Verified so far (Sep 8)
- USDC on Arc: ERC‑20 interface `0x3600000000000000000000000000000000000000`, 6 decimals; native gas uses 18. No wrapped USDC. Deploy with `evm_version = "paris"`.
- Arc predeploys: Multicall3, Permit2, CREATE2 factory, EURC, CCTP v2, Gateway, StableFX escrow (docs.arc.io contract addresses).
- DeFi scan result: see R16.
- Arc docs list The Graph as an Arc indexer (Subgraphs + Explorer) — still confirm Studio network id (R5).
- Arc Testnet: chain id 5042002, RPC `https://rpc.testnet.arc.io` (registry alias `https://rpc.testnet.arc.network`, `https://arc-testnet.drpc.org`; all return chainId 0x4cef52), viem ships `arcTestnet`.
- The Graph: `arc-testnet` and `arc` in networks registry, Studio deploy `https://api.studio.thegraph.com/deploy`; graph-cli 0.98.1 auto-fetches ABIs from `https://testnet.arcscan.app/api`.
- ERC‑8183 reference on Arc Testnet: `0x0747EEf0706327138c69792bF28Cd525089e4583`; Circle SDK blockchain id `ARC-TESTNET`, SCA wallets.
- ENSIP‑26 keys: `agent-context`, `agent-endpoint[<protocol>]`.
- Prize texts read for ENS, Arc, Graph (see PRD §7).
