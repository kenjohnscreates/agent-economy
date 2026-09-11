# @agent-town/web

Botanica desktop UI for Agent Town (docs/ARCHITECTURE.md §9). Next.js app router, 1440×900 target, built on the frozen `@agent-town/shared` contract and the mock/real API on port 3001.

## Run

```bash
pnpm install
pnpm -r build                                  # shared + api first
pnpm --filter @agent-town/api dev              # terminal 1: real API (needs .env API_MODE=real)
pnpm --filter @agent-town/web dev              # terminal 2: UI on :3000
```

Clone-without-secrets / rehearsal: `pnpm --filter @agent-town/api dev:mock` instead.

Env (all optional): `NEXT_PUBLIC_API_URL` (default `http://localhost:3001`), `NEXT_PUBLIC_TOWN_NAME` (default `botanica`), `NEXT_PUBLIC_ENS_EXPLORER_URL` (default `https://explorer.ens.dev`).

## Real mode (M5.8)

The UI does not change between mock and real; only the API behind `NEXT_PUBLIC_API_URL` does.

```bash
API_MODE=real pnpm --filter @agent-town/api dev   # subgraph + ENS + Arc balances (needs .env)
pnpm --filter @agent-town/web dev
```

- The real source answers `501 NOT_IMPLEMENTED` until its first refresh has landed. The shell shows a "warming up" card and retries with backoff (1s, 2s, 4s, then 8s) until the snapshot loads, then opens the stream. "Cannot reach" (no HTTP at all) and other errors get their own card; both have a retry button and a switch to replay.
- The header shows `api · mock|real` (from `/health`), the advisor and Signal C flags and the tick length (from `/state`).
- Mayor POSTs in real mode need `ALLOW_BROADCAST=true` on the API; otherwise the toast shows the 501 text. Nothing is faked.
- If the stream drops, the badge shows `reconnecting` (EventSource retries by itself) or `error` (closed); a reconnect button appears next to it.

## How the client works

One object, `TownState` (`lib/store.ts`), holds everything the screen shows. Every stream event runs through `reduce()` and every panel reads from the result, so the map, cards, scoreboard and feed can never disagree.

- `lib/api.ts`: typed fetchers for every route in `API_ROUTES`; every response is parsed with its shared zod schema.
- `lib/sse.ts`: `openTownStream()` for `GET /events`; one listener per `SSE_EVENTS` name, each frame validated with `parseSseEvent`.
- `lib/replay.ts`: same callback shape fed from `fixtures/replay.json`, with pause, speed and seek.
- `lib/useTown.ts`: loads `/agents`, `/scoreboard`, `/loans?status=pending`, attaches the stream, and refetches `/agents` on every `tick` because positions and balances only live there.
- `lib/direction.ts`: `txDirection(kind, agent, counterparty)` decides who pays whom. Used by the feed and the map.
- `lib/usdc.ts`: 6-decimal USDC strings in, formatted strings out. No floats touch money.
- `lib/connect.ts`: retry backoff and the wording for warming / unreachable / failed.
- `lib/links.ts`: arcscan wallet link, ENS explorer link, and `<town>` placeholder substitution for the mock.
- `lib/rate.ts`: bank panel helpers: the rate stack (market APY + spread + default premium = town rate), utilisation tone, fetch age, loan book buckets, latest advisor verdict.
- `components/Shell.tsx`: Forest shell: world window (`MapSlot`), agent cards, scoreboard, bank panel, feed, stream controls.
- `components/BankPanel.tsx`: treasury balance, utilisation, base and town rate, loan book with advisor reasoning. `RateTooltip.tsx` is the hover/focus breakdown of the town rate from `scoreboard.rate` and `scoreboard.signals` (source subgraph, raw market APY, fetch time). `StaleBadge.tsx` appears when `signals.stale` is true.
- `components/MapSlot.tsx` holds the frozen contract for the map: the `MapSlotProps` type, the `ZONES` rectangles in the 640 by 360 native frame, and `zonePoint()`. It renders `components/map/TownMap.tsx`, which owns the real PixiJS scene (card M5.2, #51). Nothing outside `components/map` knows that Pixi exists, so the rest of the app talks to the map only through those props.

## Map (M5.2)

The town map is a real PixiJS scene now, not a placeholder. It shipped in #51 and the brief it was built from is `docs/ASTRA-MAP-BRIEF.md`.

What lives where:

- `components/MapSlot.tsx` is the boundary. It owns `MapSlotProps`, the `ZONES` rectangles and `zonePoint()`, and it renders `TownMap`. Everything below this file is rendering only.
- `components/map/TownMap.tsx` is the client component. It mounts a fixed 640 by 360 canvas, imports the scene with a dynamic `import()` so Pixi never runs during server rendering, resizes by picking a whole-number scale from 1 to 4 so the pixels stay hard, and handles the keyboard: arrow keys cycle agents, Enter selects, Escape clears. The canvas has `role="img"` and an `aria-label` that spells out the tick, the phase, the agent count and the last payment, so a screen reader gets the same information the picture shows. If the scene fails to start, the component shows an error message instead of a blank box.
- `components/map/scene.ts` is the scene itself, in seven layers: sky, far, mid, zones, agents, coins, hud. It draws the hover label, handles the click that selects and deselects an agent, spawns a coin along the route for every monetary transaction, and pulses the bank node for 480 ms on `approve_loan`, `deny_loan`, `mark_default` and `set_rate`.
- `components/map/agents.ts` moves an agent to its target over 750 ms and picks the idle, walk, work or emote frame. `coins.ts` is a fixed pool of coin slots so the animation never allocates per frame. `paths.ts` holds the bridge geometry and the shortest route between zones, shared by the terrain generator, the agents and the coins. `hud.ts` draws pixel text chips from the generated 5 by 7 font. `assets.ts` loads the sprite strips and the tile atlas once and caches them across React remounts.
- `lib/map.test.ts` covers routing, the coin lifecycle, the agent state transitions and the generated sprite sheets. It runs in Node with no browser and no GPU, under `pnpm --filter @agent-town/web test`.

The map reads props and nothing else. It never fetches, so it behaves the same in mock, real and replay.

### The /map-demo route

`app/map-demo/page.tsx` is a full-screen version of the map with no API behind it. Start the UI and open `http://localhost:3000/map-demo`:

```bash
pnpm --filter @agent-town/web dev        # then open /map-demo
```

The page imports `fixtures/replay.json` directly, so it does not need the API, the SSE stream, or the `public/replay.json` copy that the shell's replay toggle uses. It feeds each recorded event through the same `lib/store.ts` reducer the shell uses, one event at a time, and hands the result to `MapSlot`. The toolbar has Play/Pause, a speed select (0.25x, 0.5x, 1x, 2x, 4x, 8x), a Restart button, and a live readout of the current tick and storyline phase. **Rehearsal / fallback only** — the ETHOnline prize video is the live shell (`:3000` → real `:3001`), not this route.

### Regenerating the art

Both generators are deterministic scripts that write PNG and JSON into `public/`, and their output is committed, so you only need to run them if you change the generator:

```bash
pnpm --filter @agent-town/web sprites    # scripts/gen-sprites.ts -> public/sprites/<agent>.png|json
pnpm --filter @agent-town/web tiles      # scripts/gen-tiles.ts   -> public/tiles/atlas.png|json
```

`sprites` writes one 624 by 48 strip and one frame table per agent in the frozen roster. `tiles` writes a single 1024 by 1024 atlas holding the terrain, the composed landscape, the props, the bridges and the 5 by 7 HUD font, plus `atlas.json` with the frame rectangles, the 32 px tile size and the palette. Nothing is downloaded and no art tool is needed, the pixels are drawn in TypeScript.

### Dependencies

`pixi.js` 8 is the only extra dependency the map added (`^8.20.1`). #51 added that one package and the `tiles` script, nothing else.

## Replay (no backend)

```bash
MOCK_TICK_MS=1500 pnpm --filter @agent-town/api dev:mock      # fast ticks
pnpm --filter @agent-town/web record -- --seconds 60         # writes fixtures/replay.json
```

`dev`/`build` copy the fixture to `public/replay.json` (gitignored). Switch the header toggle to **replay** to play it with speed controls. Fallback if testnet is down — **not** the Sat 12 Sep live film.

## Brand

Tokens in `app/globals.css` are lifted from the Botanica Brand Book v1.0 §16 and §19 (Forest shell, Leaf accent, Space Grotesk / Inter / Space Mono, 14 px cards, 180 ms ease-out, numbers count up, nothing bounces). `public/brand/mark.png` is a placeholder tile; drop the approved circuit-leaf mark there. The logo is never redrawn.

Sprites in `public/sprites` are generated by `pnpm --filter @agent-town/web sprites` from the character construction spec (§12) with the role→archetype colourways: treasurer→Guardian, merchant→Farmer, worker→Builder, consumer→Explorer. Each of the eight agents gets a 624 by 48 pixel strip with thirteen named 48 px frames (idle, walk, work, emote) and a JSON frame table next to it. These are the sprites the map actually draws, and both the PNGs and the JSON files are committed to the repo.

## Cards

| Card | State |
|---|---|
| M5.1 shell + API client + stream | done (#39) |
| M5.3 agent card | done (#39, links #48) |
| M5.5 scoreboard + sparkline | done (#39) |
| M5.6 event feed | done (#39) |
| M5.2 town map | done (#51) |
| M5.4 bank panel with rate breakdown | done (#42) |
| M5.7 mayor panel | done (#47) |
| M5.8 swap to real, polish, empty and error states | done (#48) |

## Working with Codex / Astra (FE lane)

Setup on the developer machine, never in the repo:

```bash
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
/reload-plugins
/codex:setup
```

Create an untracked `.codex/config.toml` at the repo root with `model = "gpt-6-astra"` and `model_reasoning_effort = "high"`, then hand over one card at a time with `/codex:rescue --background --model gpt-6-astra <brief>` and review with `/codex:review --base main`. Leave the plugin's stop-review gate off.
