# Live demo file split (Dan ↔ Kenny)

Record **Sat 12 Sep** against **live testnet**, not mock. Anyone may edit `apps/web`; do not dual-write the same files in the same hour.

**Cycle (do / say / BE footnotes):** [`docs/CYCLE.md`](CYCLE.md)

**Git email:** never `dan@users.noreply.github.com` (that is GitHub user `dan`, not you). Use `116534345+don-radman@users.noreply.github.com` or an email on your GitHub Settings → Emails. `git config user.email` to check.

Ping in STATUS before a PR: `touching: <paths>`.

## Kenny / this session (BE + live wiring)

- `apps/sim`, `apps/api`, `packages/circle`, `packages/contracts`, `.env` (local only)
- Bank panel **inbound** strip (Gateway) if wanted (optional; film arcscan)
- Mayor live queue = subgraph pending ids (not fixture `L-3`)
- Visitor admit + chat (`apps/api` + `VisitorPanel`) — #61
- `API_MODE=real`, `ALLOW_BROADCAST` for mayor POSTs **and** visitor create/chat

## Dan / map agent (FE chrome)

- Pixi speech chips, overlap, dashboard chrome
- `/map-demo` = **rehearsal only** (fixtures). Video is `:3000` → real `:3001`
- **Do not** add a 9th map sprite for the visitor (shell filters to `AGENT_NAMES`)

## Frozen

- `packages/shared` schemas (both humans + mock update in the same PR)
- `MapSlotProps` / `ZONES` / `zonePoint`

## Video bar

Live Arc §12: **Your agent** (name + Arc USDC + chat deposit) → cut to arcscan (cy **#9**, bo **#10**, Gateway mint [0x14fad3ea…](https://testnet.arcscan.app/tx/0x14fad3ea624b2343524282dabe26f35900b8e30b0f4e2021516b2cb523a5d3ea)) → mayor click **#11**. UI: map → visitor panel → 3×3 cards; right column unchanged. Do **not** `--ticks 12 --yes` until mayor uses #11.
