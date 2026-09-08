# Agent Town — Agent Runbook (v0.1)

How the human pair and the AI agents build this. Models are chosen by the humans; this doc fixes **roles, tiers, and protocol**.

## 1. Roles

| Role | Count | Tier | Responsibilities |
|---|---|---|---|
| **Master** (orchestrator) | 1 | T1 | Owns [STATUS.md](STATUS.md) and [MILESTONES.md](MILESTONES.md). Sequences cards, resolves deps, enforces exit criteria + timeboxes, applies the scope‑cut ladder at checkpoints (Thu 22:00, Sat 12:00). Never writes feature code; writes task briefs. |
| **Builder‑heavy** | n | T1 | Solidity (Treasury, Registrar), ENSv2/EAC, Circle wallet execution, subgraph mappings, rules engine, advisor guardrails. |
| **Builder‑medium** | n | T2 | Deploy scripts, typed clients, API real mode, storyline, map rendering, mayor panel. |
| **Builder‑light** | n | T3 | Scaffolds, fixtures, mock server, `.env.example`, narrator prompts, UI cards/panels, README, docs, screenshots. |
| **Reviewer** | 1 | T1 | Gate on every PR: bugs, security (keys, reentrancy, unchecked returns), readability for a senior human dev, dead code, naming, comments. Can request changes; cannot expand scope. |

Tier mapping to models is left to the humans; keep T1 for anything touching funds, permissions, or cross‑system contracts.

## 2. Task brief format (master → builder)

```
CARD: M2.2 TownRegistrar.sol
TIER: T1   OWNER: BE
CONTEXT: ARCHITECTURE §4.3; ENS docs tutorial-contract-developers; deployments.json
INPUTS: town subregistry addr, resolver addr, roster.json
OUTPUT: packages/contracts/src/TownRegistrar.sol + tests + deploy script
EXIT: forge tests green incl. negative test (worker cannot set town.credit-score)
TIMEBOX: 3h  → if exceeded, report blockers, do not widen scope
DO NOT: touch apps/*, change shared API schemas
```

## 3. Protocol

1. Master picks next unblocked card from MILESTONES, writes brief, marks `in_progress` in STATUS.
2. Builder works on branch `card/<id>-<slug>`; commits small; opens PR with: what/why, how to test, tx hashes/screenshots where relevant.
3. Reviewer runs checklist (§4); approves or requests changes (max 2 rounds; then master decides).
4. Merge to `main`; master marks `done` with evidence link; updates STATUS "Next up".
5. Any blocker > 30 min → builder posts `BLOCKED: <id> <reason> <tried>` in STATUS; master reassigns or applies fallback from RISKS.

Handoff between humans: either human can pick any card; the brief + exit criteria are the contract. Env/keys shared via agreed secret channel, never in git.

## 4. Reviewer checklist

- [ ] Exit criteria in brief are met with evidence (test output, tx hash, screenshot).
- [ ] No secrets, private keys, entity secrets, or API keys in diff; `.env.example` updated if new var.
- [ ] Solidity: checks‑effects‑interactions, `SafeERC20`/return checks, access control on every state‑changing fn, events for every state change, 18‑decimal USDC assumptions explicit, no `address(0)` transfers.
- [ ] ENS: tokenIds never cached; role checks tested negatively; hackathon deployment addresses only.
- [ ] Circle: transactions polled to terminal state; failures surfaced, not swallowed.
- [ ] Graph: no mocked/static data on any production path; queries typed.
- [ ] Rules: deterministic; LLM paths have timeout + fallback + caps.
- [ ] Readability: module has a 3–6 line header comment (purpose, inputs, outputs); functions ≤ 60 lines; names say what not how; no commented‑out code.
- [ ] Types: zod at boundaries; no `any` without comment.
- [ ] Tests added/updated for the card's logic; `pnpm -r build && pnpm -r test` green.
- [ ] Docs touched if behaviour or env changed.

## 5. Tiering rules (what goes where)

| Send to T3 (cheap) | Send to T2 | Keep at T1 |
|---|---|---|
| Boilerplate, fixtures, mock data, README sections, `.env.example`, UI cards/panels from a spec, prompt templates, scripts that call an existing typed client | Deploy scripts, typed GraphQL client, API routes over existing services, map rendering, storyline scheduler, forge tests for specified behaviour | Contract logic, EAC role design, Circle execution wrapper, subgraph mappings, rules engine, advisor guardrails, anything with money or permissions, all reviews |

## 6. Working agreements

- Chain + subgraph are the source of truth; UI never invents state.
- FE/BE contract (`packages/shared`) changes require both humans' ack and a mock update in the same PR.
- Every on‑chain script is re‑runnable and idempotent (checks before writes).
- Demo path first: anything not on the 3‑minute storyline is stretch.
- Timebox honoured: report, don't grind.

## 7. Status update template (master, end of each session)

```
## <date time EDT>
Done: M1.1 (tests green), M1.2 (0x… on arcscan)
In progress: M1.3 (BE), M5.2 (FE)
Blocked: —
Risks changed: R5 resolved — arc-testnet available in Studio
Next up: M1.4, M1.5, M5.3
Checkpoint call: none / cut #1 applied
```
