# Live demo file split (Dan ↔ Kenny)

Record **Sat 12 Sep** against **live testnet**, not mock. Anyone may edit `apps/web`; do not dual-write the same files in the same hour.

**Cycle (do / say / BE footnotes):** [`docs/CYCLE.md`](CYCLE.md)

Ping in STATUS before a PR: `touching: <paths>`.

## Kenny / this session (BE + live wiring)

- `apps/sim`, `apps/api`, `packages/circle`, `packages/contracts`, `.env` (local only)
- Bank panel **inbound** strip (Gateway) if M9.1 lands
- Mayor live queue = subgraph pending ids (not fixture `L-3`)
- `API_MODE=real`, `ALLOW_BROADCAST` for mayor POSTs

## Dan / map agent (FE chrome)

- Pixi speech chips, overlap, dashboard chrome
- `/map-demo` = **rehearsal only** (fixtures). Video is `:3000` → real `:3001`

## Frozen

- `packages/shared` schemas (both humans + mock update in the same PR)
- `MapSlotProps` / `ZONES` / `zonePoint`

## Video bar

Live Arc §12 (arcscan txs + subgraph + ENS resolve + mayor click **#11**). API is `API_MODE=real` + Supabase service key. Do **not** `--ticks 12 --yes` until mayor uses #11. Gateway is Fri spike; if faucet/API blocks, film Arc-only Saturday.
