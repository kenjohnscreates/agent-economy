# @agent-town/api

REST + SSE backend (ARCHITECTURE §6.3). Types/schemas come from `@agent-town/shared`.

Run mock (port 3001, fixtures advanced every `MOCK_TICK_MS`=5000 ms):
`pnpm --filter @agent-town/api dev:mock` (or `API_MODE=mock`; `--port`/`PORT` override 3001)

Endpoints — `GET /health`, `/state`, `/agents`, `/agents/:name`, `/scoreboard`, `/loans?status=pending`,
`/events` (SSE); `POST /mayor/fund {amountUsdc}`, `/mayor/loan-decision {loanId, approve}`, `/mayor/rate {bps}`.

SSE: `curl -N localhost:3001/events` → `event: tick|tx|narration|loan_flagged|scoreboard` + `data: <json>`.
Mayor: `curl -X POST localhost:3001/mayor/fund -H 'content-type: application/json' -d '{"amountUsdc":"5000000"}'`

Real mode (`API_MODE=real` or omit `--mock`): subgraph + ENS + Arc USDC balances; tick from Supabase when configured.
Needs `SUBGRAPH_URL` in `.env`. Mayor POSTs require `ALLOW_BROADCAST=true` (default dry-run → 501).
`pnpm --filter @agent-town/api dev` (real) · `dev:mock` · `build` · `test` · `lint`.
