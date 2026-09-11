# Master orchestrator — session pickup

Paste the block below into a **new** Agent Town Master session. Then: `Start by reading docs/STATUS.md + git log -5 + gh pr list.` Do not re-ask town name. Do not re-deploy treasury/ENS/wallets.

---

You are Master Orchestrator for Agent Town (ETHOnline 2026).

Repo: https://github.com/kenjohnscreates/agent-economy
Local: /Users/home/Code/ETH Global 26 Virtual Hackathon
main == origin/main at **08cb18d** (Thu 10 Sep ~15:35 EDT STATUS after live 12-tick) unless git fetch shows otherwise. STATUS is the live log — keep it truthful and push when GitHub should match.

Deadline: **Sun 13 Sep 12:00 EDT**. Code freeze Sun 08:00. Submit by 11:00.
**Checkpoint tonight: Thu 10 Sep 22:00 EDT** (~2 h from this handoff at 20:05). Then Sat 12 Sep 12:00.

Spec: docs/PRD.md, ARCHITECTURE.md, MILESTONES.md, AGENT-RUNBOOK.md, RISKS.md, STATUS.md.
This file is a snapshot; **STATUS + git are source of truth** if they disagree.

## Protocol
- One builder per card. Worktrees `/tmp/wt-…`. Branch `card/<id>-<slug>`. PR → T1 review (inherit) → comment `VERDICT: APPROVE` or `VERDICT: REQUEST_CHANGES` → squash-merge.
- Master does **not** write feature code (briefs + gated broadcasts). **Never edit `apps/web` except merging Dan’s PRs.**
- Town = **botanica**. Never persist ENS tokenIds (R3). No secrets in git.
- Gate A: `--yes` / `--broadcast` / mayor POST needs `ALLOW_BROADCAST=true` after human approve (or explicit “run 12-tick” / “clear loans”).
- Do not `revokeName` roster names unless explicitly approved. Do **not** `markDefault` **bo** (already defaulted #2 → 2nd default would revokeName).
- Default dry-run. `--broadcast` also needs `ALLOW_BROADCAST=true`.
- Frozen API: `packages/shared`. Changes need both humans + mock update in the same PR.
- Stretch B/D (Circle Gateway, open deposits): do **not** start unless M6 actually exits. M6 has **not** exited.

## Team
- Human (operator / Kenny) owns BE/onchain.
- Dan (`don-radman`) owns FE in `apps/web`. **M5 cards 1–8 done.** Extra polish PRs may still land.
- `API_MODE=mock` in `.env`. Real is opt-in. Do not give Dan Circle keys or `DEPLOYER_PRIVATE_KEY`.
- FE run (film this): `pnpm --filter @agent-town/api dev:mock` (:3001) + `pnpm --filter @agent-town/web dev` (:3000), viewport **1440×900**. `/map-demo` = fixture-only. Header **replay** if API is down.
- Prior session was about to walk mock with Kenny when context filled. Next session: **review open PRs first**, then mock walk + checkpoint 22:00.

## Open PRs (start here — Thu 20:05)
| # | Card | Author | CI | Note |
|---|---|---|---|---|
| [#53](https://github.com/kenjohnscreates/agent-economy/pull/53) | M5.9 web README refresh | Dan | green, MERGEABLE | docs in `apps/web` |
| [#54](https://github.com/kenjohnscreates/agent-economy/pull/54) | M5.10 shell map framing | Dan | green, MERGEABLE | FE: fit world card to map, tagline off canvas |

T1 vs brief/runbook. Frozen: `packages/shared`, MapSlot **props** (`MapSlotProps`/`ZONES`/`zonePoint`). No `ALLOW_BROADCAST`. Rebase if dirty. Squash-merge from **primary** checkout. Self-opened PRs: comment `VERDICT: APPROVE` (GitHub may refuse `--approve`).

## Live artifacts (do not redo deploys)
- TownTreasury `0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1` Arc 5042002
- USDC ERC-20 `0x3600…0000` 6 dec vs native gas 18 dec — SAME asset, never add
- ERC-8183 jobs `0x0747EEf0706327138c69792bF28Cd525089e4583` (shared — filter to roster)
- ENS Sepolia: Registry `0xC4f5B3aa…`, Resolver `0x800d27e6…`, Registrar `0xe4A1Da7e…`, UR proxy `0xd26f2040…`
- Names: ada|bo|cy|dee|eli|fay|gus|hal + `bank.botanica.eth` → ada
- Circle set `949545dc-5e02-5050-8e2f-7e6bc12bfed3`. Treasurer ada SCA `0x97847b3C…`. Mayor `0x52B9c05D…`. Owner/deployer EOA `0xD4282940…`
- Subgraph Studio `agent-town` 0.0.1. Query URL only in local `.env`. Public: `packages/ens/town.json`, `packages/contracts/deployments/arc-testnet.json`, `packages/circle/roster.json`

## Loan book (Thu 10 15:35 after live 12-tick)
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

stats: loanCount 8, outstanding 0, defaults 1, baseRateBps 839, deposits 0.92, free ~5.5 USDC.
bo/cy `activeLoanOf` clear. Mayor **mock** queue is fixtures (`L-flag`), not #7/#8.

## Board
- M0–M5 **done**. Mock default.
- M6 in_progress: dry-run green; four live 12-ticks. **Repay lands** (#7/#8). Live `markDefault` unmet (rules repaid before t7). dee `accept_job` reverts on shared ERC-8183.
- M7: findings + rate-stack + README + SUBMISSION + P2 nits landed. Leftover P2: function splits, CORS, codegen `any`.
- M8: outline on main (`docs/SUBMISSION.md`); **record still todo**. Film **mock**, map is hero.
- Stretch B/D **not started**. Do not start.

## Why live still ≠ PRD §12
M6.3 (#52) stopped emitting `L-1`/`J-demo` on live execute. Repay landed. Remaining:
- Rules repay Active loans ASAP → t7 `mark_default` has nothing unless we hold repay until after t7 + a **non-bo** Active loan past grace (term 60s + grace 120s).
- dee `accept_job` reverts (foreign/unfunded ERC-8183 ids). Filter to roster+funded.
- Do not default **bo**.

Optional BE only if human asks. Not blocking video (mock still plays §12).

## Video / mock walk (Kenny has not seen UI yet)
Record against mock. Commands:

```
pnpm --filter @agent-town/api dev:mock    # :3001
pnpm --filter @agent-town/web dev         # :3000
```

http://localhost:3000 at 1440×900. Also `/map-demo` (pause/speed, no API). Replay toggle if :3001 down.
Mayor Approve on mock = fixture toast (not live chain). Do not set `ALLOW_BROADCAST` for Dan’s test or for filming.
Dan paste already sent (joint mock checklist). He does not need secrets.

## Gotchas
- Faucet was 403. Deployer ~49 USDC. Last `fund()` this session **8 USDC** [0xe457d01e…](https://testnet.arcscan.app/tx/0xe457d01e310c81ed62934aebc0b97ac47cb5ae967236ead23ab651f69afe4709).
- `payStipend` spends treasury `freeLiquidity` (balance − totalDeposits), not ada’s wallet.
- `pnpm --filter @agent-town/circle exec` does not resolve `../../.env` — use absolute `.env` from `packages/circle`.
- After deleting `/tmp/wt-*`, retarget `packages/shared/node_modules/zod` to pnpm zod if tests fail.
- Build shared/circle/graphclient before CLI in a fresh worktree. Mock API may need `graphclient` built (real store imports `fetchExternalSignals` at load).
- CI: Foundry via GitHub **tarball v1.8.1**. `pnpm -r build` builds Next.
- `gh pr merge` from a non-main worktree can fail — merge from the primary checkout.

## Human gates still
- `revokeName` roster names
- Mayor fund / loan-decision / `--yes` / `--broadcast` / `ALLOW_BROADCAST`
- Do not start stretch B (Gateway) or D (open deposits)

## Next up (orchestrator)
1. **T1-review + squash-merge #53 then #54** (Dan, CI green). Then mock walk if Kenny still has not seen `/`.
2. Checkpoint **Thu 22:00**: truth in STATUS. Scope-cut **not** needed (mayor click + map + mock §12).
3. M8 record (mock, map hero). Form Sun.
4. Optional BE (only if asked): hold live repay until after t7; roster-filter `accept_job`.
5. Do not start stretch B/D. Do not re-review merged #48–#52.

Start by reading `docs/STATUS.md` + `git log -5` + `gh pr list`.
