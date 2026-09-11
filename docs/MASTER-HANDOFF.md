# Master orchestrator — session pickup

Paste the block below into a **new** Agent Town Master session. Then: `Start by reading docs/STATUS.md + git log -5 + gh pr list.` Do not re-ask town name. Do not re-deploy treasury/ENS/wallets.

---

You are Master Orchestrator for Agent Town (ETHOnline 2026).

Repo: https://github.com/kenjohnscreates/agent-economy
Local: /Users/home/Code/ETH Global 26 Virtual Hackathon
main rewritten Fri 01:11 (Co-authored-by on #51). Pre-rewrite SHAs after `9721597` are stale — `git fetch && git reset --hard origin/main`. STATUS + git are source of truth.

Deadline: **Sun 13 Sep 12:00 EDT**. Code freeze Sun 08:00. Submit by 11:00.
Checkpoints: Thu 10 Sep 22:00 **DONE**. Next: **Sat 12 Sep 12:00**.

Spec: docs/PRD.md, CYCLE.md (12-tick do/say), ARCHITECTURE.md, MILESTONES.md, AGENT-RUNBOOK.md, RISKS.md, STATUS.md, SUBMISSION.md.
This file is a snapshot; **STATUS + git are source of truth** if they disagree.

## Protocol
- One builder per card. Worktrees `/tmp/wt-…`. Branch `card/<id>-<slug>`. PR → T1 review (inherit) → comment `VERDICT: APPROVE` or `VERDICT: REQUEST_CHANGES` → squash-merge.
- File split: [`docs/DAN-LIVE-SPLIT.md`](DAN-LIVE-SPLIT.md). Kenny: sim/api/circle. Dan: Pixi speech/dashboard. Ping `touching:` in STATUS before overlapping PRs. Frozen: `packages/shared` schemas, MapSlot **props**.
- Town = **botanica**. Never persist ENS tokenIds (R3). No secrets in git.
- Gate A: `--yes` / `--broadcast` / mayor POST needs `ALLOW_BROADCAST=true`. **Human approved Gate A Thu 23:00** for M6.5 live 12-tick + cy seed. Still ask before `revokeName`.
- Do **not** `markDefault` **bo** (already defaulted #2 → 2nd default would revokeName). Default **cy** only.
- Frozen API: `packages/shared`. Changes need both humans + mock update in the same PR.
- Stretch **B (Gateway) authorized Fri**. Stretch D (open deposits): do not start. Do not build yield vault A.

## Team
- Human (operator / Kenny) owns BE/onchain.
- Dan (`don-radman`) owns map/speech chrome. Kenny may edit `apps/web` for live bank/mayor wiring. Split: `docs/DAN-LIVE-SPLIT.md`.
- Do not give Dan Circle keys or `DEPLOYER_PRIVATE_KEY`.
- FE live: `API_MODE=real` + `pnpm --filter @agent-town/api dev` (:3001, loads repo-root `.env`) + `pnpm --filter @agent-town/web dev` (:3000), viewport **1440×900**. `/map-demo` = rehearsal fixtures only.
- Record **Sat 12 Sep** against **live**. Mock / `/map-demo` / replay = rehearsal or fallback if testnet is down.

## Open PRs
None as of Fri 11 Sep 00:05. T1 Dan polish if it lands. Frozen: `packages/shared`, MapSlot **props**. Squash-merge from **primary** checkout. Gate A approved for M6.5. Do **not** run another live 12-tick until mayor uses **#11**.

## Live artifacts (do not redo deploys)
- TownTreasury `0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1` Arc 5042002
- USDC ERC-20 `0x3600…0000` 6 dec vs native gas 18 dec — SAME asset, never add
- ERC-8183 jobs `0x0747EEf0706327138c69792bF28Cd525089e4583` (shared — filter to roster)
- ENS Sepolia: Registry `0xC4f5B3aa…`, Resolver `0x800d27e6…`, Registrar `0xe4A1Da7e…`, UR proxy `0xd26f2040…`
- Names: ada|bo|cy|dee|eli|fay|gus|hal + `bank.botanica.eth` → ada
- Circle set `949545dc-5e02-5050-8e2f-7e6bc12bfed3`. Treasurer ada SCA `0x97847b3C…`. Mayor `0x52B9c05D…`. Owner/deployer EOA `0xD4282940…`
- Subgraph Studio `agent-town` 0.0.1. Query URL only in local `.env`. Public: `packages/ens/town.json`, `packages/contracts/deployments/arc-testnet.json`, `packages/circle/roster.json`
- Ledger: Kenny personal Supabase. Tables exist. `service_role` has DML. **Do not enable RLS** without policies. Key = `sb_secret_…` or JWT `eyJ…` service_role — **never** `sb_publishable_…`. URL/key stay in local `.env`.

## Loan book (Thu 10 23:30 after M6.5 live 12-tick)
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
| 9 | **Defaulted** | **cy** | 0.2 |
| 10 | Repaid | bo | 1.2 |
| 11 | **Pending** | **cy** | 0.2 |

stats: loanCount 10 (+ pending 11), outstanding 0, defaults **2**, baseRateBps 829, deposits 0.92. bo `activeLoanOf` clear. cy slot = **#11 Pending** (mayor click). Do not run another live 12-tick until the mayor uses #11.

## Board
- M0–M5 **done**. Mock = rehearsal / clone-without-secrets.
- M6: **live default landed** (cy #9). M6.5 12-tick done. Deliver re-submit **fixed** (`bc6e112`). `API_MODE=real` + Supabase wired.
- M8: record **Sat 12 Sep live**.
- Stretch **B Gateway Fri**. D off.

## Why live still ≠ PRD §12 (clean reset)
Default + repay + buys + jobs **are on arcscan**. Remaining vs a from-tick-0 film:
- Ledger on this Supabase project is **empty** (`tick:null`) until sim writes here — bubbles/feed stay blank until then. Scoreboard/loans still come from subgraph.
- Mayor click = **loan #11** (not mock `L-3`).
- Dirty treasury: do **not** `pnpm reset --yes` / another `--ticks 12 --yes` before mayor uses #11.
- Gateway not started.

## Video
Record live Saturday. Rehearsal mock still works. Commands (live):

```
API_MODE=real ALLOW_BROADCAST=true
pnpm --filter @agent-town/api dev         # :3001 — node --env-file-if-exists=../../.env
pnpm --filter @agent-town/web dev         # :3000
```

Do **not** start another 12-tick until mayor Approve/Deny **#11**. If a later recording needs ticks, human Gate A first.

ENS names are on Sepolia; money is Arc USDC. Gateway uses **Circle Sepolia USDC** `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`.

## Gotchas
- Faucet was 403. Deployer ~49 USDC. Last `fund()` **8 USDC** [0xe457d01e…](https://testnet.arcscan.app/tx/0xe457d01e310c81ed62934aebc0b97ac47cb5ae967236ead23ab651f69afe4709).
- `payStipend` spends treasury `freeLiquidity` (balance − totalDeposits), not ada’s wallet.
- `pnpm --filter @agent-town/circle exec` does not resolve `../../.env` — use absolute `.env` from `packages/circle`.
- After deleting `/tmp/wt-*`, retarget `packages/shared/node_modules/zod` to pnpm zod if tests fail.
- Build shared/circle/graphclient before CLI in a fresh worktree. Mock API may need `graphclient` built (real store imports `fetchExternalSignals` at load). Dan: mock also needs `@agent-town/ens` + `@agent-town/circle` `dist`.
- CI: Foundry via GitHub **tarball v1.8.1**. `pnpm -r build` builds Next.
- `gh pr merge` from a non-main worktree can fail — merge from the primary checkout.
- Rate-tooltip: click races focus+toggle (hover/focus still open it).
- `#54` 2x `@container (min-width: 1280px)` cannot fire under 1440 shell + 400px rail (1440×900 stays 1x).
- MCP `apply_migration` does **not** GRANT DML. PostgREST `service_role` needs `SELECT/INSERT/UPDATE/DELETE` on ledger tables. Publishable keys (`sb_publishable_…`) cannot read them.
- **don-radman git email:** never `dan@users.noreply.github.com` (GitHub user `dan`). Use `116534345+don-radman@users.noreply.github.com`. Fri 01:11: rewrote #51 Co-authored-by + force-pushed `main` (`d8ead6e`). Dan: `git fetch && git reset --hard origin/main` if no unpushed work.

## Human gates still
- `revokeName` roster names
- New Sepolia Circle wallet create (Gateway)
- Stretch D (open deposits) — off
- Another live `--ticks 12 --yes` (blocked until mayor uses #11)

## Next up (orchestrator)
1. Walk UI `API_MODE=real` against **#11** mayor click + arcscan/subgraph.
2. **M9.1 Gateway** Fri (gus ETH-SEPOLIA Circle USDC). Timebox ~5h. Drop Saturday if faucet/API blocks.
3. FE live polish per `DAN-LIVE-SPLIT.md`.
4. Record Sat 12th live. Form Sun.
5. Do **not** run another `--ticks 12 --yes` until mayor uses #11.

Start by reading `docs/STATUS.md` + `git log -5` + `gh pr list`.
