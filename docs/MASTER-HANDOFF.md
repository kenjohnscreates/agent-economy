# Master orchestrator — session pickup

Paste the block below into a **new** Agent Town Master session. Then: `Start by reading docs/STATUS.md + git log -5.` Do not re-ask town name. Do not re-deploy treasury/ENS/wallets.

---

You are Master Orchestrator for Agent Town (ETHOnline 2026).

Repo: https://github.com/kenjohnscreates/agent-economy
Local: /Users/home/Code/ETH Global 26 Virtual Hackathon
main == origin/main at **4b24b6f** (Thu 10 Sep ~15:35 EDT, M6.3 #52 + live 12-tick) unless git fetch shows otherwise. STATUS is the live log — keep it truthful and push when GitHub should match.

Deadline: **Sun 13 Sep 12:00 EDT**. Code freeze Sun 08:00. Submit by 11:00.
**Checkpoint tonight: Thu 10 Sep 22:00 EDT.** Then Sat 12 Sep 12:00.

Spec: docs/PRD.md, ARCHITECTURE.md, MILESTONES.md, AGENT-RUNBOOK.md, RISKS.md, STATUS.md.
This file is a snapshot; **STATUS + git are source of truth** if they disagree.

## Protocol
- One builder per card. Worktrees `/tmp/wt-…`. Branch `card/<id>-<slug>`. PR → T1 review (inherit) → comment `VERDICT: APPROVE` or `VERDICT: REQUEST_CHANGES` → squash-merge.
- Master does **not** write feature code (briefs + gated broadcasts). **Never edit `apps/web` except merging Dan’s PRs.**
- Town = **botanica**. Never persist ENS tokenIds (R3). No secrets in git.
- Gate A: `--yes` / `--broadcast` / mayor POST needs `ALLOW_BROADCAST=true` after human approve (or explicit “run 12-tick” / “clear loans”).
- Do not `revokeName` roster names unless explicitly approved.
- Default dry-run. `--broadcast` also needs `ALLOW_BROADCAST=true`.
- Frozen API: `packages/shared`. Changes need both humans + mock update in the same PR.
- Stretch B/D (Circle Gateway, open deposits): do **not** start unless M6 actually exits.

## Team
- Human (operator) owns BE/onchain.
- Dan (`don-radman`) owns FE in `apps/web`.
- Intended FE order was M5.7 mayor → M5.2 map → M5.8 real. Dan skipped ahead then delivered map: **M5.8 #48** + **M5.2 #51 `9721597`** both on main. **M5 done.** `API_MODE=mock` in `.env` (real is opt-in).
- FE run: `pnpm --filter @agent-town/api dev:mock` (:3001) + `pnpm --filter @agent-town/web dev` (:3000). `/map-demo` is fixture-only. Replay toggle if testnet is down.
- Dan one-liners already used: M5.7 #47, M5.8 #48, M5.2 #51. No further FE cards.

## Live artifacts (do not redo deploys)
- TownTreasury `0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1` Arc 5042002
- USDC ERC-20 `0x3600…0000` 6 dec vs native gas 18 dec — SAME asset, never add
- ERC-8183 jobs `0x0747EEf0706327138c69792bF28Cd525089e4583` (shared — filter to roster)
- ENS Sepolia: Registry `0xC4f5B3aa…`, Resolver `0x800d27e6…`, Registrar `0xe4A1Da7e…`, UR proxy `0xd26f2040…`
- Names: ada|bo|cy|dee|eli|fay|gus|hal + `bank.botanica.eth` → ada
- Circle set `949545dc-5e02-5050-8e2f-7e6bc12bfed3`. Treasurer ada SCA `0x97847b3C…`. Mayor `0x52B9c05D…`. Owner/deployer EOA `0xD4282940…`
- Subgraph Studio `agent-town` 0.0.1. Query URL only in local `.env`. Public: `packages/ens/town.json`, `packages/contracts/deployments/arc-testnet.json`, `packages/circle/roster.json`

## Loan book (updated Thu 10 15:35 after live 12-tick)
| ID | Status | Who | Amount |
|---|---|---|---|
| 1 | Repaid | bo | 0.3 |
| 2 | Defaulted | bo | 0.2 |
| 3 | Repaid | bo | 1.2 |
| 4 | Repaid | cy | 1.2 |
| 5 | Denied | bo | 1.2 |
| 6 | Denied | cy | 1.2 |
| 7 | Repaid | bo | 1.2 |
| 8 | Repaid | cy | 1.2 |

stats last read (Thu 10 15:35): loanCount 8, outstanding 0, defaults 1, baseRateBps 839, deposits 0.92, free ~5.5 USDC.
#7/#8 repaid this session — bo/cy `activeLoanOf` clear.

## Board (as of 4b24b6f)
- M0–M4 done (code + live evidence).
- **M5 done:** M5.1 #39 · M5.2 #51 `9721597` · M5.4 #42 · M5.7 #47 · M5.8 #48. Mock default.
- M6 in_progress: dry-run green; four live 12-ticks; **#7/#8 repaid on-chain** (M6.3). Live mark_default still unmet (rules repaid before t7). dee accept_job still reverts on shared ERC-8183.
- M7 in_progress: M7.1 #45 · M7.1b #46 · M7.2 #41 · M7.3 #43 · **M7.1c #49 `56d9b91`**. Remaining P2 skipped on purpose (function splits, CORS, codegen).
- M8 in_progress: **M8.2a #50** outline on main; map is now the video hero; record/upload still todo. Stretch B/D not started.

## Why a “full” PRD §12 12-tick still isn’t true
M6.3 stopped emitting fixture ids on live execute. **Repay now lands** (#7 bo / #8 cy this run). Remaining gaps:
- Rules repay Active loans as soon as merchants can pay, so **t7 mark_default has nothing left** unless we hold repay until after default.
- On-chain grace is seconds (term 60s + 120s), not ticks — cannot `markDefault` a loan approved in the same 3-min run.
- dee `accept_job` reverts on the shared ERC-8183 (foreign or unfunded job ids).
- Do **not** `markDefault` bo (already defaulted #2 → 2nd default would `revokeName`).

## Gotchas
- Faucet was 403. Deployer ~49 USDC after Thu 10 check. Last `fund()` this session **8 USDC**.
- `payStipend` spends treasury `freeLiquidity` (balance − totalDeposits), not ada’s wallet.
- `pnpm --filter @agent-town/circle exec` does not resolve `../../.env` — use absolute `.env` path from `packages/circle`.
- After deleting `/tmp/wt-*`, retarget `packages/shared/node_modules/zod` to pnpm zod if tests fail to resolve shared.
- Build shared/circle/graphclient before CLI in a fresh worktree. Mock API may need `graphclient` built because real store imports `fetchExternalSignals` at module load.
- `API_MODE=mock` in `.env`; real = `API_MODE=real`. Mayor POSTs 501 without `ALLOW_BROADCAST=true`.
- CI: Foundry via GitHub **tarball v1.8.1** (`.github/workflows/ci.yml`) — foundryup attestation CDN 502/500. `pnpm -r build` builds Next (`apps/web` is real).
- GitHub may refuse `--approve` on PRs you opened yourself; comment `VERDICT: APPROVE` then squash-merge.
- `gh pr merge` from a non-main worktree can fail (`main` already used by primary worktree) — merge from the primary checkout.

## Human gates still
- `revokeName` roster names
- Mayor fund / loan-decision / `--yes` / `--broadcast`
- Approve **#7/#8** — done this session (now Repaid)

## Next up (orchestrator)
1. Checkpoint **Thu 22:00**: truth in STATUS. Scope-cut not needed.
2. Optional: hold live merchant repay until after t7 + new non-bo loan past grace so `markDefault` lands. Job accept on shared ERC-8183 still reverts.
3. M8 record still todo (film mock; map is hero). Do not start stretch B/D.
4. Do not `revokeName`. Do not default bo (already has #2).

Start by reading `docs/STATUS.md` + `git log -5` + `gh pr list`.
