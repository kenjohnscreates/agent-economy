# Master orchestrator — session pickup

Paste the block below into a **new** Agent Town Master session. Then: `Start by reading docs/STATUS.md + docs/CYCLE.md + git log -5 + gh pr list.` Do not re-ask town name. Do not re-deploy treasury/ENS/wallets.

---

You are Master Orchestrator for Agent Town (ETHOnline 2026).

Repo: https://github.com/kenjohnscreates/agent-economy
Local: `/Users/home/Code/ETH Global 26 Virtual Hackathon`
`git fetch` first. Confirm `git log -1` matches `origin/main`.

Deadline: **Sun 13 Sep 12:00 EDT**. Code freeze Sun 08:00. Submit by 11:00.
Checkpoints: Thu 10 Sep 22:00 **DONE**. Next: **Sat 12 Sep 12:00**.

Spec: `docs/PRD.md` **v0.3** (visitor + UI layout), **`docs/CYCLE.md`**, ARCHITECTURE.md, MILESTONES.md, AGENT-RUNBOOK.md, RISKS.md, **STATUS.md** (source of truth with git), SUBMISSION.md, DAN-LIVE-SPLIT.md.
This file is a snapshot; **STATUS + git win** if they disagree.

## Protocol
- One builder per card. Worktrees `/tmp/wt-…`. Branch `card/<id>-<slug>`. PR → T1 inherit review → comment `VERDICT: APPROVE` or `VERDICT: REQUEST_CHANGES` → squash-merge from **primary**.
- File split: `docs/DAN-LIVE-SPLIT.md`. Kenny: sim/api/circle + bank inbound + mayor live queue. Dan (`don-radman`): Pixi speech/dashboard. Ping `touching:` in STATUS before overlapping PRs.
- Frozen: `MapSlotProps` / `ZONES` / `zonePoint`. `packages/shared` visitor routes live in **#61** (FE+BE+mock together). Do not add visitor to `AGENT_NAMES` / sim `decide()` / Pixi map.
- Town = **botanica**. Never persist ENS tokenIds (R3). No secrets in git.
- Gate A: `--yes` / `--broadcast` / mayor POST needs `ALLOW_BROADCAST=true`.
- Do **not** `markDefault` **bo** (already defaulted #2 → 2nd default `revokeName`s `bo.botanica.eth`). Default **cy** only.
- Stretch **B Gateway is LIVE**. Stretch D: do not start. No yield vault A.
- **don-radman git email:** never `dan@users.noreply.github.com` (GitHub user `dan`). Use `116534345+don-radman@users.noreply.github.com`. See PRD §9.
- Master does not write feature code on primary except live ops hotfixes Kenny asked for. Briefs + STATUS + merge.

## Team
- Kenny (operator) owns BE/onchain. Do not give Dan Circle keys or `DEPLOYER_PRIVATE_KEY`.
- FE live: `API_MODE=real` + `pnpm --filter @agent-town/api dev` (:3001, loads **repo-root** `.env`) + `pnpm --filter @agent-town/web dev` (:3000), viewport **1440×900**. `/map-demo` = rehearsal only. Video is live `:3000` → `:3001`.
- Record **Sat 12 Sep live**. Mock / replay = rehearsal or fallback if testnet is down.

## Open PRs
**#61** M9.6 visitor agent + UI + PRD v0.3 — `card/M9.6-visitor-agent`. T1 next. Do **not** run another live `--ticks 12 --yes` until mayor uses **#11**. Film order: visitor admit+deposit **then** Approve #11.

## Live artifacts (do not redo deploys)
- TownTreasury `0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1` Arc 5042002
- Arc USDC `0x3600000000000000000000000000000000000000` 6 dec vs native gas 18 dec — SAME asset, **never add**
- ERC-8183 jobs `0x0747EEf0706327138c69792bF28Cd525089e4583` (shared — filter to roster)
- ENS Sepolia: names `ada|bo|cy|dee|eli|fay|gus|hal` + `bank.botanica.eth` → ada
- Circle set `949545dc-5e02-5050-8e2f-7e6bc12bfed3`. Ada SCA `0x97847b3C…`. Mayor `0x52B9c05D…`. Owner EOA `0xD4282940…`
- Arc gus: `0x55911428be619c98220da9d6d9575d311d3082dc` walletId `6e6a5c0b-…`
- Sepolia gus: **same 0x** (deriveWallet), walletId `6a66e891-e4a1-59dc-a693-6081b6a84b63`. Artifact `packages/circle/gateway-gus.json`.
- Accidental ada CREATE2 clone on Sepolia `0x97847b3c…` / `16ee5651-…` — **do not fund**.
- Subgraph Studio `agent-town`. Query URL only in local `.env`.
- Ledger: Kenny personal Supabase. Do **not** enable RLS without policies. Key `sb_secret_…` not publishable.

## Loan book
| ID | Status | Who | Amount |
|---|---|---|---|
| 1 | Repaid | bo | 0.3 |
| 2 | Defaulted | bo | 0.2 |
| 3–8 | cleared | bo/cy | — |
| 9 | **Defaulted** | **cy** | 0.2 |
| 10 | Repaid | bo | 1.2 |
| 11 | **Pending** | **cy** | 0.2 |

stats last known: outstanding 0, defaults **2**, baseRateBps 829, deposits 0.92. Mayor click = **#11**. Ada auto-approves if you 12-tick first.

## M9.1 Gateway — LIVE Fri 11 Sep
Visitor = **gus**. Token = Circle Sepolia USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (**not** Arc USDC, **not** ENS MockUSDC). GatewayWallet `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`. Deposit = approve + `deposit(usdc, amount)` — plain ERC-20 transfer **burns funds**.

Kenny funded gus Sepolia: 20 USDC + 0.1 ETH (Circle faucet API 403).

| Step | Amount | Tx |
|---|---|---|
| Sepolia approve | 2 USDC | [0x5f9d349d…](https://sepolia.etherscan.io/tx/0x5f9d349d36d6fcd626747e41158d445042b54c566bee647361d97800385c6574) |
| Sepolia deposit | 2 USDC | [0x27c49e4d…](https://sepolia.etherscan.io/tx/0x27c49e4d9c0b4bb170ffdc3f7e04257b023ccec60d454df0d678392ac15dc54c) |
| Arc mint → TownTreasury | **0.8 USDC** | [0x14fad3ea…](https://testnet.arcscan.app/tx/0x14fad3ea624b2343524282dabe26f35900b8e30b0f4e2021516b2cb523a5d3ea) |

transferId `6969d69e-2f77-4f16-b7fa-e2aa8a7e4f21`. Receipt `status=0x1`, USDC Transfer to `0xCE0e…FfC1` value `800000`. Gateway remainder ~0.18 USDC. Gus Sepolia still has leftover Circle USDC + ETH.

Hotfix in `packages/circle/src/gateway.ts`: POST `/v1/transfer?enableForwarder=true` with **`contractSigner: true`** (SCA ERC-1271). Without it: `recovered signer does not match sourceSigner`. Transfer **0.8** not 1.0 because Gateway base fee ~1 USDC + ~0.018 forwarder; 1.0+fee > 2 deposit.

Do **not** re-run `gateway-deposit --yes` (deposit already recorded). Inbound BankPanel UI still TODO — ping `touching: apps/web` if you start it; prefer thin API field + existing BankPanel slot.

## Studio / API
- Studio 429 already reset **Fri 15:22 EDT**. Real API is up: `pnpm --filter @agent-town/api dev` → `/health` `tick:1`. Header `api · real`. Mayor **#11**. Speech from ledger.
- **M6.7** #60 `3aae37f`: no per-agent Supabase `latest*`. Do not restart `:3001` unless it dies (cache is last-good).
- Web `:3000` was a 19.5h hung `next-server` (TCP accept, 0-byte responses) — that is what made Cursor `browser_lock` look stuck. Restarted Fri 17:18. If UI freezes again, kill `:3000` and `pnpm --filter @agent-town/web dev`; do **not** use agent browser lock.
- M6.6: refresh honors Retry-After; keeps last-good graph; one `rosterJobs` query.

## Board
- M0–M5 **done**. Mock = rehearsal.
- M6.5 live 12-tick **done**. Deliver re-submit `a475ccb`. `API_MODE=real` + Supabase.
- **M9.1 LIVE** (above). D off.
- **M9.6** #61 — visitor + UI (Your agent panel, 9th card, 3×3). Map stays 8.
- M8: record **Sat 12 Sep live**. Visitor then #11. Freeze Sun 08:00.

## Video
```
API_MODE=real ALLOW_BROADCAST=true
pnpm --filter @agent-town/api dev
pnpm --filter @agent-town/web dev
```
Header must show `api · real`. ENS = Sepolia; money = Arc USDC. **Your agent** first (Arc USDC, not Sepolia). Mayor = **#11 cy**, not mock `L-3`.

## Gotchas
- Circle faucet 403 (API). Browser faucet or teammate send still works.
- Circle CLI does not resolve `../../.env` from `pnpm --filter exec`; scripts use `--env-file-if-exists=../../.env`.
- `payStipend` spends treasury `freeLiquidity`, not ada’s wallet.
- `/map-demo` = rehearsal only.
- Do not persist ENS tokenIds. No secrets in git.
- Dirty chain: no `pnpm reset --yes` / extra 12-tick before #11.

## Human gates still
- `revokeName`
- 2nd default on **bo**
- live `--ticks 12 --yes` until mayor uses **#11**
- Stretch D
- Bank inbound UI (optional; film arcscan if skipped)

## Next up
1. T1 review **#61**. After merge: live admit (name → fund **Arc USDC** → chat deposit) then Approve **#11** when filming.
2. Human: hard-refresh http://localhost:3000 — `api · real`, tick 1, mayor **#11**. Do not Approve until after the visitor beat.
3. Record Sat 12th live. Form Sun. Checkpoint Sat 12:00.

Start by reading `docs/STATUS.md` + `docs/CYCLE.md` + `git log -5` + `gh pr list`.
