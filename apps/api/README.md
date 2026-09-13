# @agent-town/api

Live pulse of the town: ticks, wallets, Graph, mayor, visitor mint. Product pitch: [root README](../../README.md).

REST + SSE (ARCHITECTURE §6.3). Types from `@agent-town/shared`.

Run mock (port 3001, fixtures advanced every `MOCK_TICK_MS`=5000 ms):
`pnpm --filter @agent-town/api dev:mock` (or `API_MODE=mock`; `--port`/`PORT` override 3001)

ETHOnline demo is **real mode**. `dev` loads repo-root `.env` (`node --env-file-if-exists=../../.env`).

Real mode (`API_MODE=real`): subgraph + ENS + Arc USDC balances; tick/narration from Supabase when `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` are set. Key must be **service_role** (`eyJ…` or `sb_secret_…`), never `sb_publishable_…`. Ledger tables need `GRANT SELECT, INSERT, UPDATE, DELETE … TO service_role` (see `apps/sim/supabase/migrations/001_ledger.sql`). Do **not** enable RLS without policies.

Endpoints — `GET /health`, `/state`, `/agents`, `/agents/:name`, `/scoreboard`, `/loans?status=pending`,
`/events` (SSE); `POST /mayor/fund`, `/mayor/loan-decision`, `/mayor/rate`; visitor create/chat (gated `ALLOW_VISITOR`).

SSE: `curl -N localhost:3001/events` → `event: tick|tx|narration|loan_flagged|scoreboard` + `data: <json>`.
Mayor: `curl -X POST localhost:3001/mayor/fund -H 'content-type: application/json' -d '{"amountUsdc":"5000000"}'`

Needs `SUBGRAPH_URL` in `.env`. Mayor POSTs require `ALLOW_BROADCAST=true` (default dry-run → 501).
`pnpm --filter @agent-town/api dev` (real) · `dev:mock` · `build` · `test` · `lint`.

Live walk: **Live** mode + Town data. Mayor click = pending loan **#11**. Do not another `--ticks 12 --yes` until that click.
