# Astra brief: the Botanica town map (card M5.2)

This document is the complete hand-off for building the interactive map layer of Agent Town. It is written for a coding model with no prior context. Read it top to bottom before touching code. Everything you need is in this file or in the repository paths it names.

```
CARD: M5.2 Town map (overworld, PixiJS)
TIER: T1   OWNER: FE (Dan)
CONTEXT: this file; docs/PRD.md §3, §5, §12; docs/ARCHITECTURE.md §6.3, §9; packages/shared/src/{api,events,roster,rules}.ts; apps/web/components/MapSlot.tsx; apps/web/lib/direction.ts
INPUTS: the props contract in §3 below; sprites/tiles you generate per §7; fixtures/replay.json for offline testing
OUTPUT: apps/web/components/map/** (PixiJS layer), apps/web/scripts/gen-sprites.ts (upgraded), apps/web/public/sprites/**, apps/web/public/tiles/**, apps/web/app/map-demo/page.tsx
EXIT: `pnpm --filter @agent-town/web typecheck && lint && test && build` green; /map-demo plays fixtures/replay.json at 60 fps at 1440x900 with 8 agents and 20 coins in flight; every item in §9 checked
TIMEBOX: 6 h. If exceeded, stop, commit what works behind the placeholder, and report blockers.
DO NOT: edit packages/shared, apps/api, apps/sim, or apps/web/lib/store.ts; add dependencies other than pixi.js@8; invent state the stream did not send; use any colour outside §4; draw the Botanica logo.
```

## 1. What you are building

Agent Town is a live economy of eight AI agents that hold real USDC wallets on Arc Testnet and act every 15 seconds: consumers buy from merchants, merchants post jobs into escrow, workers deliver and get paid, everyone can deposit at the treasury, and the treasurer lends and marks defaults. A human, the mayor, can fund the treasury, approve or deny a flagged loan, and set the base rate. Every one of those actions is an on-chain transaction, and the front end is a window onto that ledger. The brand is Botanica: "Agents grow the economy."

The map is the hero of the screen and the hero of the demo video. It must make three things legible at a glance: where each agent is, that money is moving between named parties, and that the town reacts to events (a default, a rate hike, a mayor decision). It sits inside a rounded card on a Forest-green UI shell. It is the only place pixel art appears; the rest of the UI is crisp vector.

Rule one: the map never invents state. Agents move only when `/agents` says their position changed. Coins fly only when a `tx` event arrives. If the stream is quiet, the map is quiet except for ambient water and leaves.

## 2. Where it plugs in

`apps/web/components/MapSlot.tsx` is the mount point and currently renders an SVG placeholder. Replace its body with your PixiJS layer but keep the exported `MapSlotProps` interface, `ZONES`, and `zonePoint` unchanged. The shell (`apps/web/components/Shell.tsx`) already passes live data into it and re-renders on every stream event. You do not touch the data path.

Data sources, for your understanding only (you consume props, not these):
- `GET /agents` returns each agent's `position {building, x, y}`; the shell refetches it on every `tick` event.
- `GET /events` (SSE) carries `tick`, `tx`, `narration`, `loan_flagged`, `scoreboard`. The shell reduces these into state; `lastTx` and `tick` reach you as props.
- The mock server (`pnpm --filter @agent-town/api dev:mock`, port 3001) produces all of the above without a chain. `apps/web/fixtures/replay.json` is a recording of it; `/map-demo` must run from that file alone.

## 3. Props contract (frozen)

```ts
export interface MapSlotProps {
  agents: AgentSummary[];        // 8 entries, roster order; see below
  lastTx: TxEvent | null;        // spawn a coin when this object identity changes
  tick: number;
  phase: "boom" | "borrow" | "default" | "hike" | "recover";
  selected: string | null;       // agent name highlighted by the cards
  onSelectAgent: (name: string | null) => void;
  reducedMotion: boolean;        // prefers-reduced-motion; see §5
}
```

`AgentSummary` (from `packages/shared/src/api.ts`), fields you use:

```ts
{
  name: "ada" | "bo" | "cy" | "dee" | "eli" | "fay" | "gus" | "hal";
  ensName: string;               // "ada.botanica.eth"
  role: "treasurer" | "merchant" | "worker" | "consumer";
  balanceUsdc: string;           // 6-decimal integer string, "3000000" = 3 USDC; never a float
  creditScore: number | null;
  position: { building: "bank" | "market" | "workshop" | "homes"; x: number; y: number }; // x,y in 0..1 inside the building zone
  lastDecision: { tick: number; kind: ActionKind; summary: string } | null;
  narration: string | null;      // speech bubble, max 120 chars
  avatar: string;                // "/sprites/<name>.png"
}
```

`TxEvent` (from `packages/shared/src/events.ts`):

```ts
{
  tick: number;
  agent: string;                 // initiator label, or "mayor"
  kind: ActionKind;
  amountUsdc: string | null;     // null for non-monetary kinds
  counterparty: string | null;   // agent label, or "treasury" / "escrow"
  txHash: string; explorerUrl: string; status: "pending" | "complete" | "failed";
}
```

Direction of money is a property of `kind`, already implemented in `apps/web/lib/direction.ts`. Call `txDirection(kind, agent, counterparty)` and `isMonetary(tx)`; do not re-derive. The table it encodes:

| kind | from | to |
|---|---|---|
| buy | agent | counterparty |
| fund_escrow | agent | escrow |
| complete_job | escrow | counterparty |
| deposit, repay | agent | treasury |
| withdraw | treasury | agent |
| approve_loan | treasury | counterparty |
| pay_stipend | treasury | counterparty (or agent) |
| post_job, accept_job, deliver, request_loan, deny_loan, mark_default, set_rate, set_credit_score, append_review, idle | none | none |

Party to place mapping: an agent name resolves to that agent's current sprite; `treasury` resolves to the Bank zone centre; `escrow` resolves to the Workshop zone centre; `mayor` resolves to the Bank zone top edge.

Zones are defined in `MapSlot.tsx` (`ZONES`) in a 640 by 360 native frame. Keep those rectangles; they are the contract between the mock's positions and the screen.

## 4. Visual specification (from the Botanica Brand Book v1.0)

Palette. Ten core colours plus derived ramp steps. Nothing else, ever.

| Name | Hex | Use on the map |
|---|---|---|
| Forest | `#0B2E1B` | outlines on characters and props, deepest shadow, sign backgrounds |
| Growth | `#166534` | trunks, grass shadow, Farmer body |
| Leaf | `#7CB342` | grass top, foliage highlights, active glow, coin core |
| Sprout | `#D9F0C6` | circuit-vein glow, foam, HUD text, coin halo |
| Mist | `#F4F7EF` | Builder body, cloud faces |
| Sky | `#7CC7E4` | sky, Explorer body |
| Water | `#38B2C4` | lakes, waterfalls |
| Earth | `#8B6F47` | soil strata, wood, paths |
| Stone | `#A7A7A7` | rock, robot joints |
| Sand | `#EAD9B7` | paths, rope, shoreline |
| derived | earth_dark `#4A3A22`, earth_light `#B8956A`, water_dark `#1F6F7C`, stone_dark `#5A5A5A`, stone_light `#D2D2CC`, brass `#C9A24E`, sky_zenith `#5DB1DC` | ramp steps only |

Never: pure black `#000000`, pure white as a surface, purple or magenta, neon, gradients other than the sky (Sky at horizon to `#5DB1DC` at zenith, 50% checkerboard dither allowed there only).

Pixel rules. 32 by 32 px base tile. Character sprite 32 by 32 body on a 48 by 48 canvas with a one-pixel ground row. Integer scaling only (2x, 3x, 4x); nearest-neighbour; no anti-aliasing; no dithering on characters, water or foliage; uniform pixel size across the scene; at most 32 colours on screen. Selective dark outline on characters and props only; terrain uses value contrast. Light from the top-left; a one or two pixel darker step on the right and underside of forms; no drawn shadows, no fog, no bloom, no lens flare.

Camera. Top-down 3/4 management view (the brand book's alternative view). Horizon in the upper third; sky occupies roughly 25 to 35% of the frame as a strip behind distant islands. Compose in three depth planes: foreground zones with agents at full contrast; mid-ground bridges and paths at 90%; distant islands and mountains at 60% contrast shifted toward Sky.

World. A bright temperate archipelago of floating islands, permanent late morning. Each of the four zones is its own island, connected by wooden plank bridges with rope rails. Islands have stepped grassy tops, layered Earth-and-Stone cliffs, mossy undersides tapering to roots. Include at least one waterfall (straight vertical column, Sprout foam) and one turquoise lake. Trees are round cloud-like canopies in two or three greens with Growth trunks; groves, not forests. Blocky flat-bottomed white clouds drift slowly right to left. Technology is hidden in nature: a circuit-vein tree or shrine stone with a Sprout glow at the Bank. Never cables, screens, chrome, weapons, storms, lava, monsters.

Zones mapped to buildings:

| Building | Brand zone | Set dressing |
|---|---|---|
| bank | Compound: old-growth grove | mossy stone shrine with a glowing Sprout node, one circuit tree, the treasurer stands here |
| market | Coordinate: market square at the bridge hub | market stalls, seed crates, signpost, the widest bridge lands here |
| workshop | Build: workshop platform on stilts | scaffolds, tool racks, a lantern post, a lift |
| homes | Plant: nursery terraces | farm huts, seedbeds in rows, a water barrel, a small irrigation waterfall |

Characters. Chunky friendly robots about one tile tall, 2.5 heads, big rounded-rectangle head (12 to 14 px wide), dark Forest visor across the face, two 2 by 2 glowing square eyes, no mouth, mandatory two-leaf sprout antenna in Leaf and Growth, boxy torso with a chest emblem, segmented arms with Stone joints, mitten hands, boots one pixel wider than the leg, exactly one accessory. Emotion is eye shape and antenna tilt only.

Town role to archetype and colourway (base / shade / highlight / emblem / eyes):

| role | archetype | base | shade | highlight | emblem | eyes | accessory |
|---|---|---|---|---|---|---|---|
| treasurer (ada) | Guardian | `#D2D2CC` | `#A7A7A7` | `#F4F7EF` | `#7CB342` shield | `#7CB342` | shield emblem on chest |
| merchant (bo, cy) | Farmer | `#166534` | `#0B2E1B` | `#7CB342` | `#7CB342` | `#EAD9B7` | hood |
| worker (dee, eli, fay) | Builder | `#F4F7EF` | `#A7A7A7` | `#FFFFFF` | `#8B6F47` | `#7CB342` | tool backpack |
| consumer (gus, hal) | Explorer | `#7CC7E4` | `#38B2C4` | `#D9F0C6` | `#0B2E1B` | `#D9F0C6` | goggles and pack |

Agents that share a role differ by a one-step tint of the shade colour and by accessory detail, never by leaving the palette. Name labels above agents use a 5 by 7 bitmap uppercase font in Sprout on a Forest chip.

Animation budgets. Idle: 2 to 4 frame bob, antenna sways one pixel. Walk: 4 to 6 frames, arms swing, no head bob beyond one pixel. Work loop per role at 4 to 8 frames (Guardian stands watch, Farmer plants, Builder hammers, Explorer scans). Emote: eyes change shape and a 16 by 16 pixel icon (sprout, spark, question mark) pops above the head for about 12 frames. Characters run at 8 to 12 fps; ambient water and leaves at 4 fps. Nothing bounces.

## 5. Behaviour specification

- **Placement.** Each agent's screen point is `zonePoint(position.building, position.x, position.y)` in the 640 by 360 frame, scaled by the integer factor that fits the card. Ease toward a new point over roughly one tick (600 to 900 ms, ease-out); never teleport, except on first paint and when `reducedMotion` is true. When the building changes, walk along the bridge path between the two islands rather than cutting across water.
- **Coins.** When `lastTx` changes and `isMonetary(lastTx)` is true, spawn one coin: a 6 by 6 px disc, Leaf core, Sprout one-pixel halo, with the amount in the HUD font floating beside it for the first 300 ms. It travels the path graph from the payer's point to the receiver's point in about 900 ms with ease-in-out, then pops in a 4-frame Sprout ring at the receiver. Up to 20 coins in flight. Non-monetary kinds spawn no coin but may trigger a zone pulse (see below).
- **Zone pulses.** `approve_loan`, `deny_loan`, `mark_default`, `set_rate`: the Bank shrine node pulses Leaf twice (120 ms each). `mark_default`: the borrower's antenna droops and eyes squint for two ticks.
- **Narration.** When an agent's `narration` string changes, play the emote pop and show the text in a small Forest speech chip with Sprout text for 3 s, max 120 chars, word-wrapped at 24 columns, positioned above the sprite and clamped to the frame.
- **Selection and hover.** Hover shows a HUD label (name, role, balance formatted with `formatUsdc` from `apps/web/lib/usdc.ts`). Click calls `onSelectAgent(name)`; click again or click empty ground calls `onSelectAgent(null)`. The `selected` prop draws a one-pixel Leaf ring under the sprite.
- **Phase.** `phase` does not change the art. It may change ambient density: `hike` and `default` slow the cloud drift by half; `recover` restores it. Do not tint the scene.
- **Reduced motion.** When `reducedMotion` is true: no easing (positions snap), no coins in flight (draw a 400 ms static Leaf line from payer to receiver instead), no idle bob, no cloud drift. Emotes still show. State changes must remain visible.
- **Resize.** Fit the 640 by 360 frame into the card at the largest integer scale that fits, centred, letterboxed with Forest. Re-fit on `ResizeObserver`.
- **Ticking.** The map does not own a clock. Ambient animation uses PixiJS's ticker; game state comes only from props.

## 6. Performance and accessibility

- One `PIXI.Application`, one `Ticker`, sprite sheets loaded once, all sprites batched. No per-frame allocations in the update loop; reuse coin objects from a pool of 32.
- 60 fps at 1440 by 900 with 8 agents and 20 coins in flight on an integrated GPU. Measure with the ticker's FPS and log a warning below 55.
- The canvas element has `role="img"` and an `aria-label` that reads like "Town map, tick 7, phase default, 8 agents, last payment gus to bo 0.53 USDC". Update it on every prop change.
- Keyboard: the canvas is focusable; arrow keys cycle agents and set `selected`; Enter calls `onSelectAgent`. Focus ring is the shell's global 2 px Leaf outline.
- Destroy the application on unmount; no listeners leak across React re-mounts (Strict Mode double-mounts in dev).
- SSR: the component is client-only; guard `window` and lazy-import `pixi.js` so `next build` prerender does not touch WebGL.

## 7. Assets

Nothing licensed, nothing hand-drawn. Generate everything from the spec in code so the whole look is reproducible and diffable.

- Upgrade `apps/web/scripts/gen-sprites.ts` (a placeholder exists and shows the PNG encoder pattern in `scripts/png.ts`) to emit, per agent, a 48 by 48 sprite sheet strip with frames: idle (3), walk (4), work (4), emote (2). Follow the construction spec in §4 exactly. Output `apps/web/public/sprites/<name>.png` plus `<name>.json` with frame rectangles.
- Add `apps/web/scripts/gen-tiles.ts` that emits a 32 px terrain and prop atlas: grass top, grass edges, cliff face, cliff taper, root cluster, lake surface, shoreline, waterfall column (narrow, wide), splash base, round tree small and large, bush, flower cluster (Sand and Sky petals), plank bridge segment, rope rail, lantern post, farm hut, workshop platform, scaffold, shrine block, path stones, market stall, seed crate, signpost, glowing node, cloud small and large, distant island silhouette, mountain strip. Output `apps/web/public/tiles/atlas.png` and `atlas.json`.
- A 5 by 7 bitmap font atlas for HUD text (uppercase, digits, period, arrow) in Sprout on transparent.
- Keep each generator deterministic (no randomness without a fixed seed) and under two seconds to run. Add `pnpm --filter @agent-town/web sprites` and `tiles` scripts.

If the procedural terrain reads poorly after two iterations, stop and say so in the report; a CC0 tileset can be substituted by a human later, but the sprites must stay procedural because they encode the brand colourways.

## 8. Deliverables and layout

```
apps/web/components/MapSlot.tsx          keep the interface; delegate to TownMap
apps/web/components/map/TownMap.tsx      React wrapper: mount, resize, props to scene, a11y
apps/web/components/map/scene.ts         PixiJS scene: layers (sky, far, mid, zones, agents, coins, hud)
apps/web/components/map/agents.ts        agent sprite controller: placement, easing, animation state
apps/web/components/map/coins.ts         coin pool and path travel
apps/web/components/map/paths.ts         zone graph, bridge polylines, shortest route
apps/web/components/map/hud.ts           bitmap font, labels, speech chips
apps/web/components/map/assets.ts        atlas loading, frame tables
apps/web/scripts/gen-sprites.ts          upgraded
apps/web/scripts/gen-tiles.ts            new
apps/web/public/sprites/*.png|json
apps/web/public/tiles/atlas.png|json
apps/web/app/map-demo/page.tsx           full-screen map fed by fixtures/replay.json with play/pause/speed
apps/web/lib/map.test.ts                 unit tests for paths.ts routing and the coin pool
```

Commit small and often on branch `card/M5.2-town-map`. PR title `M5.2: Botanica town map (PixiJS)`, body per AGENT-RUNBOOK §3: what, why, how to test, screenshot of /map-demo at tick 7.

## 9. Acceptance checklist

Functional
- [ ] /map-demo plays fixtures/replay.json; agents move between islands; coins fly on every monetary tx; the Bank pulses on loan decisions.
- [ ] Live mode: with the mock running, the shell's map shows the same behaviour with no code change.
- [ ] Hover label, click selection, keyboard cycling all work; `selected` from a card highlights the sprite.
- [ ] `reducedMotion` path verified with Playwright `emulateMedia({ reducedMotion: "reduce" })`.
- [ ] No console errors or warnings in dev or prod.

Quality (brand book §15 checklist, applied)
- [ ] Every colour on screen is a palette colour or a listed ramp step.
- [ ] Light is from the top-left everywhere.
- [ ] Agents are small against the landscape and clearly working.
- [ ] There is water, a waterfall, and a bridge.
- [ ] The sky is bright daytime with blocky clouds.
- [ ] Technology is hidden in nature (veins, glows), not bolted on.
- [ ] Hard pixel edges, integer scaling, no anti-aliasing, no mixed pixel sizes.
- [ ] Nothing bounces; motion is spent on coins, emotes, and one pulse.

Engineering
- [ ] `pnpm --filter @agent-town/web typecheck`, `lint`, `test`, `build` all green.
- [ ] 60 fps at 1440 by 900 with 20 coins in flight; no per-frame allocations in the hot loop.
- [ ] `MapSlotProps`, `ZONES`, `zonePoint` unchanged; `packages/shared` and `apps/web/lib/store.ts` untouched.
- [ ] Generators are deterministic and run under two seconds.

## 10. How this brief is run

From the repo root, on a machine with the Codex CLI installed and logged in:

```
/codex:rescue --background --model gpt-6-astra Read docs/ASTRA-MAP-BRIEF.md in full and build card M5.2 exactly as specified. Work on branch card/M5.2-town-map. Do not modify files outside the deliverables list in section 8.
/codex:status
/codex:result
/codex:review --base main
```

Then a human runs the acceptance checklist and opens the PR.
