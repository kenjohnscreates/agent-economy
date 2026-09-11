# Master orchestrator — session pickup

Paste the block below into a **new** Agent Town Master session. Then: `Start by reading docs/STATUS.md + docs/CYCLE.md + git log -5 + gh pr list.` Do not re-ask town name. Do not re-deploy treasury/ENS/wallets.

---

You are Master Orchestrator for Agent Town (ETHOnline 2026).

Repo: https://github.com/kenjohnscreates/agent-economy
Local: /Users/home/Code/ETH Global 26 Virtual Hackathon
`git fetch` first. Fri 01:11 force-pushed `main` (rewrote #51 Co-authored-by). Pre-rewrite SHAs after old `9721597` are stale (deliver fix is now `a475ccb`, not `bc6e112`). Don: `git reset --hard origin/main` if no unpushed work. Confirm `git log -1` matches origin.

Deadline: **Sun 13 Sep 12:00 EDT**. Code freeze Sun 08:00. Submit by 11:00.
Checkpoints: Thu 10 Sep 22:00 **DONE**. Next: **Sat 12 Sep 12:00**.

Spec: docs/PRD.md, **docs/CYCLE.md** (12-tick do/say/BE), ARCHITECTURE.md, MILESTONES.md, AGENT-RUNBOOK.md, RISKS.md, STATUS.md, SUBMISSION.md, DAN-LIVE-SPLIT.md.
This file is a snapshot; **STATUS + git are source of truth** if they disagree.

## Protocol
- One builder per card. Worktrees `/tmp/wt-…`. Branch `card/<id>-<slug>`. PR → T1 review (inherit) → comment `VERDICT: APPROVE` or `VERDICT: REQUEST_CHANGES` → squash-merge.
- File split: `docs/DAN-LIVE-SPLIT.md`. Kenny: sim/api/circle + bank inbound + mayor live queue. Dan (`don-radman`): Pixi speech/dashboard. Ping `touching:` in STATUS before overlapping PRs.
- Frozen: `packages/shared` schemas, `MapSlotProps` / `ZONES` / `zonePoint`.
- Town = **botanica**. Never persist ENS tokenIds (R3). No secrets in git.
- Gate A: `--yes` / `--broadcast` / mayor POST needs `ALLOW_BROADCAST=true`. Human approved Gate A Thu 23:00 for M6.5 live 12-tick + cy seed. Still ask before `revokeName`.
- Do **not** `markDefault` **bo** (already defaulted #2 → 2nd default would revokeName). Default **cy** only.
- Stretch **B (Gateway) authorized Fri**. Stretch D: do not start. Do not build yield vault A.
- **don-radman git email:** never `dan@users.noreply.github.com` (GitHub user `dan`, not our Dan). Use `116534345+don-radman@users.noreply.github.com`. See PRD §9.

## Team
- Kenny (operator) owns BE/onchain. Do not give Dan Circle keys or `DEPLOYER_PRIVATE_KEY`.
- FE live: `API_MODE=real` + `pnpm --filter @agent-town/api dev` (:3001, loads repo-root `.env`) + `pnpm --filter @agent-town/web dev` (:3000), viewport **1440×900**. `/map-demo` = rehearsal only.
- Record **Sat 12 Sep live**. Mock / replay = rehearsal or fallback if testnet is down.

## Open PRs
None as of Fri 11 Sep 01:19. T1 Dan polish if it lands. Squash-merge from **primary** checkout. Do **not** run another live 12-tick until mayor uses **#11**.

## Live artifacts (do not redo deploys)
- TownTreasury `0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1` Arc 5042002
- USDC ERC-20 `0x3600…0000` 6 dec vs native gas 18 dec — SAME asset, never add
- ERC-8183 jobs `0x0747EEf0706327138c69792bF28Cd525089e4583` (shared — filter to roster)
- ENS Sepolia: Registry `0xC4f5B3aa…`, Resolver `0x800d27e6…`, Registrar `0xe4A1Da7e…`, UR proxy `0xd26f2040…`
- Names: ada|bo|cy|dee|eli|fay|gus|hal + `bank.botanica.eth` → ada
- Circle set `949545dc-5e02-5050-8e2f-7e6bc12bfed3`. Treasurer ada SCA `0x97847b3C…`. Mayor `0x52B9c05D…`. Owner/deployer EOA `0xD4282940…`
- Subgraph Studio `agent-town` 0.0.1. Query URL only in local `.env`.
- Ledger: Kenny personal Supabase. Tables exist. `service_role` has DML. **Do not enable RLS** without policies. Key = `sb_secret_…` or JWT `eyJ…` — **never** `sb_publishable_…`.

## Loan book (after M6.5)
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

stats: outstanding 0, defaults **2**, baseRateBps 829, deposits 0.92. Mayor click = **#11**. Do not `--ticks 12 --yes` until that click (ada would auto-approve).

## Board
- M0–M5 **done**. Mock = rehearsal.
- M6.5 live 12-tick **done**. Deliver re-submit fixed (`a475ccb`). `API_MODE=real` + Supabase GRANT done.
- Cycle script: `docs/CYCLE.md`.
- M8: record **Sat 12 Sep live**.
- Stretch **B Gateway Fri** (not started). D off.

## Why live still ≠ clean PRD §12
- Ledger on this Supabase is **empty** (`/health` `tick:null`) — feed/speech blank until sim writes here. Scoreboard/loans from subgraph.
- Mayor = **#11 cy**, not mock `L-3`.
- Dirty chain: no `pnpm reset --yes` / extra 12-tick before #11.
- Gateway not started.

## Video (live)
```
API_MODE=real ALLOW_BROADCAST=true
pnpm --filter @agent-town/api dev
pnpm --filter @agent-town/web dev
```
Header must show `api · real`. ENS = Sepolia; money = Arc USDC. Gateway token = Circle Sepolia USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (not ENS MockUSDC). Visitor = **gus**.

## Gotchas
- Faucet was 403. Deployer ~49 USDC. Last `fund()` 8 USDC [0xe457d01e…](https://testnet.arcscan.app/tx/0xe457d01e310c81ed62934aebc0b97ac47cb5ae967236ead23ab651f69afe4709).
- `payStipend` spends treasury `freeLiquidity`, not ada’s wallet.
- Circle CLI does not resolve `../../.env` from `pnpm --filter @agent-town/circle exec`.
- MCP `apply_migration` does not GRANT DML; we granted `service_role` only.
- Do not enable RLS on ledger tables without policies.
- GitHub Insights may still lag / #51 PR page may still show old Co-authored-by (GitHub keeps PR copies).

## Human gates still
- `revokeName`
- New Sepolia Circle wallet (Gateway)
- Stretch D — off
- Another live `--ticks 12 --yes` until mayor uses #11

## Next up
1. `git fetch` · walk UI `api · real` · mayor **#11**.
2. **M9.1 Gateway** Fri (gus ETH-SEPOLIA). Timebox ~5h. Drop Sat if faucet/API blocks.
3. Get **one** sim write into this Supabase (not a 12-tick) so speech/feed aren’t blank.
4. FE polish per DAN-LIVE-SPLIT (Dan: speech chips; Kenny: don’t dual-write BankPanel/MayorPanel).
5. Record Sat 12th live. Form Sun.

Start by reading `docs/STATUS.md` + `docs/CYCLE.md` + `git log -5` + `gh pr list`.
