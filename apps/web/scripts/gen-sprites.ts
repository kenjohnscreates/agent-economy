// Placeholder agent sprites from the brand construction spec (Brand Book v1.0 §12):
// 48x48 canvas, 32px chunky body, rounded head with dark visor, 2x2 glowing eyes,
// mandatory two-leaf sprout antenna, one accessory, selective Forest outline,
// light top-left, no dithering. Astra's M5.2 pass replaces these with proper sheets.
// Usage: pnpm --filter @agent-town/web sprites
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ROSTER, type Role } from "@agent-town/shared";
import { encodePng } from "./png";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../public/sprites");
const W = 48;
const H = 48;

type Rgb = [number, number, number];
const hex = (s: string): Rgb => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
];
const FOREST = hex("#0B2E1B");
const GROWTH = hex("#166534");
const LEAF = hex("#7CB342");
const SPROUT = hex("#D9F0C6");
const STONE = hex("#A7A7A7");

/** Town role -> brand archetype colourway (base, shade, highlight, emblem, eyes). */
const WAY: Record<
  Role,
  {
    base: Rgb;
    shade: Rgb;
    hi: Rgb;
    emblem: Rgb;
    eyes: Rgb;
    accessory: "shield" | "hood" | "backpack" | "goggles";
  }
> = {
  treasurer: {
    base: hex("#D2D2CC"),
    shade: STONE,
    hi: hex("#F4F7EF"),
    emblem: LEAF,
    eyes: LEAF,
    accessory: "shield",
  }, // Guardian
  merchant: {
    base: GROWTH,
    shade: FOREST,
    hi: LEAF,
    emblem: LEAF,
    eyes: hex("#EAD9B7"),
    accessory: "hood",
  }, // Farmer
  worker: {
    base: hex("#F4F7EF"),
    shade: STONE,
    hi: hex("#FFFFFF"),
    emblem: hex("#8B6F47"),
    eyes: LEAF,
    accessory: "backpack",
  }, // Builder
  consumer: {
    base: hex("#7CC7E4"),
    shade: hex("#38B2C4"),
    hi: SPROUT,
    emblem: FOREST,
    eyes: SPROUT,
    accessory: "goggles",
  }, // Explorer
};

function draw(role: Role, variant: number): Uint8Array {
  const px = new Uint8Array(W * H * 4);
  const put = (x: number, y: number, c: Rgb) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = 255;
  };
  const rect = (x: number, y: number, w: number, h: number, c: Rgb) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c);
  };
  const w = WAY[role];
  // tint the shade slightly per variant so bo/cy and dee/eli/fay differ within the ramp
  const shade: Rgb = [
    Math.max(0, w.shade[0] - variant * 10),
    Math.max(0, w.shade[1] - variant * 6),
    Math.max(0, w.shade[2] - variant * 6),
  ];
  const cx = 24;
  const ground = 44;
  // legs + boots
  rect(cx - 7, ground - 8, 5, 7, w.base);
  rect(cx + 2, ground - 8, 5, 7, w.base);
  rect(cx - 8, ground - 2, 7, 2, shade);
  rect(cx + 1, ground - 2, 7, 2, shade);
  // torso
  rect(cx - 8, ground - 20, 16, 12, w.base);
  rect(cx - 8, ground - 20, 16, 1, w.hi); // top-left light
  rect(cx + 6, ground - 20, 2, 12, shade);
  rect(cx - 8, ground - 9, 16, 1, shade);
  // arms with stone joints, mitten hands
  rect(cx - 12, ground - 19, 4, 9, w.base);
  rect(cx + 8, ground - 19, 4, 9, w.base);
  put(cx - 10, ground - 15, STONE);
  put(cx + 9, ground - 15, STONE);
  rect(cx - 12, ground - 10, 4, 2, shade);
  rect(cx + 8, ground - 10, 4, 2, shade);
  // chest emblem
  rect(cx - 2, ground - 17, 4, 4, w.emblem);
  // head (rounded rect 14 wide, ~40% height)
  rect(cx - 7, ground - 34, 14, 13, w.base);
  rect(cx - 6, ground - 35, 12, 1, w.base);
  rect(cx - 6, ground - 21, 12, 1, w.base);
  rect(cx - 7, ground - 34, 14, 1, w.hi);
  rect(cx + 5, ground - 33, 2, 12, shade);
  // visor + eyes
  rect(cx - 5, ground - 31, 10, 6, FOREST);
  rect(cx - 3, ground - 29, 2, 2, w.eyes);
  rect(cx + 1, ground - 29, 2, 2, w.eyes);
  // antenna with two-leaf sprout (species marker)
  rect(cx, ground - 38, 1, 3, GROWTH);
  put(cx - 1, ground - 39, LEAF);
  put(cx - 2, ground - 40, LEAF);
  put(cx + 1, ground - 39, LEAF);
  put(cx + 2, ground - 40, LEAF);
  put(cx, ground - 40, GROWTH);
  // accessory
  switch (w.accessory) {
    case "shield":
      rect(cx - 3, ground - 18, 6, 6, w.emblem);
      rect(cx - 2, ground - 17, 4, 4, w.hi);
      break;
    case "hood":
      rect(cx - 8, ground - 36, 16, 4, shade);
      rect(cx - 8, ground - 32, 2, 8, shade);
      rect(cx + 6, ground - 32, 2, 8, shade);
      break;
    case "backpack":
      rect(cx + 8, ground - 22, 5, 10, w.emblem);
      rect(cx + 9, ground - 22, 3, 1, hex("#B8956A"));
      break;
    case "goggles":
      rect(cx - 6, ground - 33, 12, 2, shade);
      put(cx - 4, ground - 33, w.hi);
      put(cx + 3, ground - 33, w.hi);
      break;
  }
  // selective outline: darken silhouette edge pixels
  const isSet = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < W && y < H && px[(y * W + x) * 4 + 3] === 255;
  const edge: [number, number][] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!isSet(x, y)) continue;
      if (!isSet(x - 1, y) || !isSet(x + 1, y) || !isSet(x, y - 1) || !isSet(x, y + 1))
        edge.push([x, y]);
    }
  for (const [x, y] of edge) {
    const i = (y * W + x) * 4;
    if (px[i] === FOREST[0] && px[i + 1] === FOREST[1] && px[i + 2] === FOREST[2]) continue;
    if (px[i] === LEAF[0] && px[i + 1] === LEAF[1] && px[i + 2] === LEAF[2]) continue; // keep sprout leaves bright
    put(x, y, FOREST);
  }
  return px;
}

mkdirSync(OUT, { recursive: true });
const seen: Partial<Record<Role, number>> = {};
for (const r of ROSTER) {
  const variant = seen[r.role] ?? 0;
  seen[r.role] = variant + 1;
  writeFileSync(resolve(OUT, `${r.name}.png`), encodePng(W, H, draw(r.role, variant)));
  console.log(`${r.name}.png (${r.role}, variant ${variant})`);
}
// brand mark placeholder: a Growth tile with a Leaf sprout, until the approved mark is dropped in
{
  const px = new Uint8Array(22 * 22 * 4);
  const put = (x: number, y: number, c: Rgb) => {
    const i = (y * 22 + x) * 4;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = 255;
  };
  for (let y = 0; y < 22; y++) for (let x = 0; x < 22; x++) put(x, y, GROWTH);
  for (let y = 8; y < 18; y++) put(11, y, SPROUT);
  for (let d = 1; d <= 4; d++) {
    put(11 - d, 12 - d, LEAF);
    put(11 + d, 12 - d, LEAF);
    put(11 - d, 13 - d, LEAF);
    put(11 + d, 13 - d, LEAF);
  }
  put(11, 7, LEAF);
  put(11, 6, LEAF);
  mkdirSync(resolve(OUT, "../brand"), { recursive: true });
  writeFileSync(resolve(OUT, "../brand/mark.png"), encodePng(22, 22, px));
  console.log("brand/mark.png (placeholder, replace with the approved circuit-leaf mark)");
}
