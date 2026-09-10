// Reproducible 32px terrain, multi-tile props and a 5x7 HUD font.
// Raster primitives operate on integer pixels with a locked palette.
// The composed landscape and bridge geometry share the same route graph.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "./png";
import { BRIDGES } from "../components/map/paths";
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../public/tiles");
const C = {
  forest: 0x0b2e1b,
  growth: 0x166534,
  leaf: 0x7cb342,
  sprout: 0xd9f0c6,
  mist: 0xf4f7ef,
  sky: 0x7cc7e4,
  water: 0x38b2c4,
  earth: 0x8b6f47,
  stone: 0xa7a7a7,
  sand: 0xead9b7,
  dark: 0x4a3a22,
  wood: 0xb8956a,
  deep: 0x1f6f7c,
  rock: 0x5a5a5a,
  pale: 0xd2d2cc,
  brass: 0xc9a24e,
  zenith: 0x5db1dc,
};
const W = 1024,
  H = 1024,
  pixels = new Uint8Array(W * H * 4);
let ox = 0,
  oy = 0;
let clipWidth = 640,
  clipHeight = 360;
function rect(x: number, y: number, w: number, h: number, c: number) {
  for (let j = Math.round(y); j < Math.round(y + h); j++)
    for (let i = Math.round(x); i < Math.round(x + w); i++) {
      const xx = i + ox,
        yy = j + oy;
      if (i < 0 || j < 0 || i >= clipWidth || j >= clipHeight) continue;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const n = (yy * W + xx) * 4;
      pixels[n] = c >> 16;
      pixels[n + 1] = c >> 8;
      pixels[n + 2] = c;
      pixels[n + 3] = 255;
    }
}
function oval(x: number, y: number, w: number, h: number, c: number) {
  for (let j = 0; j < h; j++) {
    const inset = Math.round(
      (w / 2) * (1 - Math.sqrt(Math.max(0, 1 - ((j - h / 2) / (h / 2)) ** 2))),
    );
    rect(x + inset, y + j, w - 2 * inset, 1, c);
  }
}
function line(x: number, y: number, xx: number, yy: number, c: number, width = 1) {
  const steps = Math.max(Math.abs(xx - x), Math.abs(yy - y));
  for (let i = 0; i <= steps; i++)
    rect(
      Math.round(x + ((xx - x) * i) / (steps || 1)),
      Math.round(y + ((yy - y) * i) / (steps || 1)),
      width,
      width,
      c,
    );
}
function box(x: number, y: number, w: number, h: number, c: number) {
  rect(x, y, w, h, C.forest);
  rect(x + 1, y + 1, w - 2, h - 2, c);
  rect(x + w - 3, y + 2, 2, h - 3, C.dark);
}
function tree(x: number, y: number, size = 1) {
  const cx = x + 16 * size,
    base = y + 43 * size;
  line(cx - 2, y + 22 * size, cx - 3, base, C.growth, 5);
  line(cx - 2, y + 24 * size, cx - 2, base - 2, C.earth, 2);
  line(cx, y + 31 * size, cx + 9 * size, y + 21 * size, C.growth, 3);
  line(cx, base - 5, cx - 9, base + 1, C.growth, 2);
  line(cx, base - 5, cx + 9, base, C.growth, 2);
  // Connected cloud-shaped lobes. Every lobe has a dark underside and lit upper left.
  for (const [dx, dy, r] of [
    [2, 14, 17],
    [15, 13, 17],
    [8, 3, 19],
    [0, 7, 15],
    [19, 5, 13],
  ]) {
    const xx = x + dx! * size,
      yy = y + dy! * size,
      d = r! * size;
    oval(xx, yy, d, d * 0.85, C.growth);
    oval(xx, yy - 1, d - 3 * size, d * 0.65, C.leaf);
  }
  for (let i = 0; i < 7; i++) {
    const xx = x + (5 + ((i * 7) % 22)) * size,
      yy = y + (8 + ((i * 5) % 12)) * size;
    line(xx, yy + 2, xx + 3, yy + 3, C.growth);
  }
}
function cloud(x: number, y: number, large = false) {
  const w = large ? 64 : 32;
  rect(x, y + 9, w, 7, C.sprout);
  rect(x + 2, y + 6, w - 4, 8, C.mist);
  rect(x + 8, y + 2, w / 2, 7, C.mist);
  rect(x + 14, y, w / 3, 6, C.mist);
}
function crate(x: number, y: number) {
  box(x, y, 14, 12, C.earth);
  rect(x + 2, y + 2, 10, 2, C.wood);
  rect(x + 2, y + 7, 10, 1, C.sand);
  line(x + 2, y + 3, x + 10, y + 9, C.dark);
  rect(x + 4, y - 2, 7, 3, C.growth);
  rect(x + 5, y - 2, 4, 1, C.leaf);
}
function hut(x: number, y: number) {
  box(x + 3, y + 14, 27, 24, C.wood);
  box(x + 12, y + 22, 9, 16, C.dark);
  for (let i = 0; i < 16; i++)
    rect(x + 16 - i, y + i, 1 + i * 2, 2, i % 4 === 0 ? C.sand : C.earth);
  line(x, y + 16, x + 16, y, C.forest);
  line(x + 16, y, x + 33, y + 16, C.dark, 2);
  rect(x + 5, y + 22, 5, 7, C.sand);
  rect(x + 7, y + 22, 1, 7, C.earth);
}
function stall(x: number, y: number) {
  box(x + 2, y + 17, 3, 20, C.earth);
  box(x + 37, y + 17, 3, 20, C.earth);
  box(x + 1, y + 30, 40, 10, C.wood);
  rect(x + 4, y + 29, 34, 2, C.sand);
  for (let n = 0; n < 7; n++) {
    const c = n % 2 === 0 ? C.leaf : C.growth;
    rect(x + n * 6, y + 4, 6, 9, c);
    rect(x + n * 6 - 2, y + 13, 6, 5, c);
    rect(x + n * 6 - 2, y + 18, 5, 3, c);
  }
  line(x, y + 4, x + 41, y + 4, C.sprout);
  crate(x + 12, y + 24);
}
function shrine(x: number, y: number) {
  box(x, y + 14, 45, 35, C.stone);
  box(x + 6, y + 3, 33, 18, C.pale);
  box(x + 13, y + 25, 19, 24, C.rock);
  rect(x + 18, y + 27, 10, 22, C.forest);
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++)
      line(x + i * 15, y + 15 + j * 10, x + i * 15 + 13, y + 15 + j * 10, C.rock);
  rect(x + 3, y + 15, 8, 3, C.growth);
  rect(x + 32, y + 32, 10, 4, C.growth);
  rect(x + 10, y + 4, 8, 3, C.leaf);
  rect(x + 18, y + 7, 9, 9, C.growth);
  rect(x + 20, y + 9, 5, 5, C.sprout);
}
function platform(x: number, y: number) {
  box(x, y, 64, 30, C.earth);
  for (let i = 4; i < 60; i += 7) {
    rect(x + i, y + 1, 1, 27, C.dark);
    rect(x + i - 1, y + 2, 1, 25, C.wood);
  }
  for (const dx of [3, 54]) {
    box(x + dx, y + 28, 6, 20, C.earth);
    rect(x + dx + 1, y + 30, 1, 16, C.sand);
  }
}
function scaffold(x: number, y: number) {
  for (const dx of [0, 29]) box(x + dx, y, 4, 40, C.earth);
  rect(x, y + 2, 33, 4, C.wood);
  rect(x, y + 22, 33, 3, C.sand);
  line(x + 3, y + 38, x + 30, y + 5, C.earth, 2);
  for (let i = 6; i < 32; i += 7) rect(x + 4, y + i, 7, 2, C.wood);
}
function rack(x: number, y: number) {
  box(x, y, 31, 19, C.earth);
  rect(x + 3, y + 2, 25, 2, C.wood);
  for (let i = 5; i < 29; i += 7) {
    rect(x + i, y + 4, 1, 10, C.sand);
    rect(x + i - 2, y + 5, 5, 3, C.stone);
  }
}
function bed(x: number, y: number) {
  rect(x, y, 38, 9, C.sand);
  rect(x + 1, y + 1, 36, 7, C.earth);
  for (let i = 4; i < 35; i += 7) {
    rect(x + i, y + 3, 1, 4, C.growth);
    rect(x + i - 2, y + 2, 2, 2, C.leaf);
    rect(x + i + 1, y + 1, 2, 2, C.sprout);
  }
}
function island(x: number, y: number, w: number, h: number, depth: number) {
  // Faceted rock columns make an irregular taper instead of a cylindrical drum.
  for (let i = 1; i < w - 1; i++) {
    const arc = Math.sqrt(Math.max(0, 1 - ((i - w / 2) / (w / 2)) ** 2));
    const lip = y + h / 2 + Math.floor(((h / 2) * arc) / 2) * 2;
    const facet = Math.floor(i / 19),
      cut = (facet * 17) % 13;
    const bottom = Math.round(depth * arc - cut);
    for (let d = 0; d < bottom; d++) {
      const strata = (d + Math.floor(i / 29) * 3) % 22;
      const colour =
        d > bottom - 12
          ? facet % 3 === 0
            ? C.rock
            : C.dark
          : strata < 3
            ? C.wood
            : facet % 3 === 1
              ? C.dark
              : C.earth;
      rect(x + i, lip + d, 1, 1, colour);
    }
    if (i % 19 === 0) line(x + i, lip + 4, x + i - 2, lip + bottom - 1, C.rock);
  }
  oval(x, y - 2, w, h + 4, C.growth);
  oval(x, y - 4, w, h, C.leaf);
  for (let i = 15; i < w - 15; i += 23) {
    const arc = Math.sqrt(Math.max(0, 1 - ((i - w / 2) / (w / 2)) ** 2));
    const yy = y + h / 2 + Math.round((h / 2) * arc) - 4;
    rect(x + i, yy, 4, 8, C.growth);
    rect(x + i + 1, yy + 7, 2, 9, C.growth);
    line(x + i + 2, yy + 8, x + i - 1, yy + 16, C.growth);
  }
  for (let i = 0; i < 80; i++) {
    const xx = (i * 67 + 19) % w,
      yy = (i * 37 + 17) % h;
    if (((xx - w / 2) / (w / 2 - 7)) ** 2 + ((yy - h / 2) / (h / 2 - 6)) ** 2 < 1 && i % 3 === 0) {
      rect(x + xx, y + yy, 1, 2, C.growth);
      rect(x + xx - 1, y + yy + 1, 3, 1, C.growth);
    }
  }
}
function waterfall(x: number, y: number, w: number, h: number) {
  rect(x, y, w, h, C.water);
  rect(x, y, 2, h, C.sprout);
  rect(x + w - 2, y, 2, h, C.deep);
  for (let i = 0; i < w; i += 5) {
    rect(x + i, y + ((i * 7) % 19), 1, 9, C.sprout);
    rect(x + i, y + h - 7, 2, 7, C.sprout);
  }
  rect(x - 3, y + h, w + 6, 2, C.sprout);
}
function bridge() {
  for (const b of BRIDGES)
    for (let n = 1; n < b.points.length; n++) {
      const a = b.points[n - 1]!,
        z = b.points[n]!;
      const steps = Math.ceil(Math.hypot(z.x - a.x, z.y - a.y) / 4);
      for (let i = 0; i <= steps; i++) {
        const x = Math.round(a.x + ((z.x - a.x) * i) / steps),
          y = Math.round(a.y + ((z.y - a.y) * i) / steps);
        rect(x - b.width / 2, y, b.width, 5, C.dark);
        rect(x - b.width / 2, y, b.width - 1, 3, C.wood);
      }
      for (const side of [-1, 1]) {
        const offset = (side * b.width) / 2;
        line(a.x + offset, a.y - 6, z.x + offset, z.y - 6, C.sand);
        box(a.x + offset - 1, a.y - 11, 3, 15, C.earth);
        box(z.x + offset - 1, z.y - 11, 3, 15, C.earth);
      }
    }
}
// One composed background is batched as a sprite; every prop also has an atlas frame.
rect(0, 0, 640, 360, C.sky);
rect(0, 0, 640, 24, C.zenith);
for (let y = 24; y < 40; y++)
  for (let x = 0; x < 640; x++) if ((x + y) % 2 === 0) rect(x, y, 1, 1, C.zenith);
for (let i = 0; i < 9; i++) {
  const x = i * 79 - 20,
    y = 69 + (i % 3) * 12;
  for (let k = 0; k < 25; k++) {
    const inset = Math.floor(k / 3) * 4;
    rect(x + 24 - inset, y + k, inset * 2, 1, C.water);
    if (k < 7) rect(x + 24 - inset, y + k, inset, 1, C.sprout);
  }
}
for (const [x, y] of [
  [37, 83],
  [530, 70],
  [155, 28],
]) {
  oval(x!, y!, 60, 15, C.water);
  oval(x! + 7, y! + 8, 43, 24, C.water);
  oval(x!, y! - 4, 60, 14, C.sprout);
  rect(x! + 27, y! - 16, 3, 14, C.water);
  oval(x! + 17, y! - 28, 23, 18, C.sprout);
}
// Keep the sky separate, allowing clouds to pass behind every foreground island.
for (let y = 0; y < 360; y++) {
  const row = pixels.slice(y * W * 4, (y * W + 640) * 4);
  pixels.set(row, (y + 640) * W * 4);
  pixels.fill(0, y * W * 4, (y * W + 640) * 4);
}
// Lake between the four islands.
oval(196, 123, 249, 180, C.deep);
oval(202, 125, 235, 173, C.water);
for (let i = 0; i < 15; i++) rect(215 + ((i * 37) % 197), 145 + ((i * 23) % 126), 7, 1, C.sky);
island(231, 29, 179, 99, 50);
island(17, 161, 224, 110, 59);
island(400, 160, 224, 109, 59);
island(205, 284, 233, 66, 36);
// Paths are quiet Sand surfaces that leave space for authoritative sprite positions.
oval(267, 79, 107, 45, C.sand);
oval(55, 205, 159, 56, C.sand);
oval(425, 204, 163, 56, C.sand);
oval(234, 312, 178, 30, C.sand);
bridge();
// Old-growth Compound, circuit traces lie inside the trunk.
tree(237, 17, 1.4);
tree(345, 7, 1.5);
tree(376, 40, 1);
tree(270, 6, 1);
rect(258, 59, 1, 18, C.sprout);
line(258, 67, 263, 62, C.sprout);
rect(262, 60, 2, 2, C.sprout);
shrine(296, 37);
waterfall(338, 118, 13, 47);
// Coordinate market hub.
tree(16, 145, 1.5);
tree(26, 208, 1.2);
tree(185, 153, 1.1);
stall(70, 173);
stall(127, 175);
crate(188, 236);
crate(53, 244);
box(174, 185, 3, 21, C.earth);
box(165, 185, 23, 9, C.wood);
// Build workshop, lift, tools, lantern.
platform(467, 176);
scaffold(553, 171);
rack(487, 161);
tree(575, 144, 1.5);
tree(538, 142, 1);
box(435, 181, 3, 24, C.earth);
box(431, 180, 11, 10, C.dark);
rect(434, 182, 5, 5, C.sand);
rect(565, 212, 1, 20, C.sand);
box(553, 231, 25, 4, C.wood);
crate(592, 248);
// Plant terraces and irrigation.
hut(226, 276);
hut(382, 276);
bed(286, 291);
bed(330, 293);
bed(286, 306);
box(265, 304, 12, 15, C.earth);
rect(266, 307, 10, 2, C.stone);
rect(266, 314, 10, 2, C.stone);
rect(410, 315, 5, 24, C.water);
waterfall(410, 339, 5, 20);
// Pebbles, seed patches and moss break up surfaces without adding noisy dithering.
for (const [x, y] of [
  [286, 96],
  [304, 106],
  [319, 116],
  [64, 231],
  [80, 248],
  [198, 224],
  [443, 243],
  [463, 248],
  [360, 332],
]) {
  oval(x!, y!, 8, 4, C.earth);
  oval(x!, y! - 1, 7, 3, C.pale);
}
for (const [x, y] of [
  [48, 196],
  [185, 253],
  [416, 192],
  [591, 229],
  [364, 298],
  [277, 73],
]) {
  for (let i = 0; i < 3; i++) {
    rect(x! + i * 4, y! + (i % 2), 1, 4, C.growth);
    rect(x! + i * 4 - 1, y! - 1 + (i % 2), 3, 2, i % 2 ? C.sky : C.sand);
  }
}
for (const [x, y] of [
  [57, 170],
  [166, 173],
  [416, 179],
  [582, 253],
  [215, 310],
]) {
  oval(x!, y!, 18, 9, C.growth);
  oval(x!, y! - 2, 14, 7, C.leaf);
  line(x! + 3, y! + 3, x! + 6, y! + 4, C.growth);
}
const frames: Record<string, { x: number; y: number; w: number; h: number }> = {
  world: { x: 0, y: 0, w: 640, h: 360 },
  sky: { x: 0, y: 640, w: 640, h: 360 },
};
const tiles: [string, number, number, () => void][] = [
  [
    "grass_top",
    32,
    32,
    () => {
      rect(0, 0, 32, 32, C.leaf);
    },
  ],
  [
    "grass_edge",
    32,
    32,
    () => {
      rect(0, 0, 32, 32, C.earth);
      rect(0, 0, 32, 5, C.leaf);
      rect(0, 5, 32, 3, C.growth);
    },
  ],
  [
    "cliff_face",
    32,
    32,
    () => {
      rect(0, 0, 32, 32, C.earth);
      rect(0, 12, 32, 4, C.wood);
      line(23, 0, 17, 32, C.dark);
    },
  ],
  [
    "cliff_taper",
    32,
    32,
    () => {
      for (let i = 0; i < 32; i++) rect(i / 3, i, 32 - (i * 2) / 3, 1, C.earth);
    },
  ],
  [
    "root_cluster",
    32,
    32,
    () => {
      line(10, 0, 16, 30, C.growth, 2);
      line(21, 0, 16, 18, C.growth, 2);
    },
  ],
  [
    "lake_surface",
    32,
    32,
    () => {
      rect(0, 0, 32, 32, C.water);
      rect(6, 8, 9, 1, C.sky);
      rect(16, 21, 8, 1, C.sprout);
    },
  ],
  [
    "shoreline",
    32,
    32,
    () => {
      rect(0, 0, 32, 10, C.sand);
      rect(0, 10, 32, 22, C.water);
    },
  ],
  ["waterfall_narrow", 32, 32, () => waterfall(10, 0, 8, 30)],
  ["waterfall_wide", 32, 32, () => waterfall(1, 0, 28, 30)],
  [
    "splash_base",
    32,
    32,
    () => {
      rect(4, 24, 24, 2, C.sprout);
      rect(8, 20, 2, 3, C.sprout);
    },
  ],
  ["tree_small", 32, 48, () => tree(0, 2)],
  ["tree_large", 64, 64, () => tree(8, 2, 1.4)],
  [
    "bush",
    32,
    32,
    () => {
      oval(2, 17, 26, 12, C.growth);
      oval(2, 14, 23, 10, C.leaf);
    },
  ],
  [
    "flowers",
    32,
    32,
    () => {
      for (const x of [5, 20]) {
        rect(x, 18, 1, 6, C.growth);
        rect(x - 1, 15, 3, 3, x === 5 ? C.sand : C.sky);
      }
    },
  ],
  [
    "plank_bridge",
    32,
    32,
    () => {
      rect(0, 0, 32, 32, C.dark);
      for (let i = 0; i < 32; i += 5) rect(0, i, 32, 4, C.wood);
    },
  ],
  [
    "rope_rail",
    32,
    32,
    () => {
      box(1, 8, 3, 24, C.earth);
      box(28, 8, 3, 24, C.earth);
      line(3, 12, 29, 12, C.sand);
    },
  ],
  [
    "lantern",
    32,
    32,
    () => {
      box(15, 0, 3, 32, C.earth);
      box(10, 4, 10, 12, C.dark);
      rect(12, 6, 6, 6, C.sand);
    },
  ],
  ["farm_hut", 64, 48, () => hut(0, 0)],
  ["workshop_platform", 64, 48, () => platform(0, 0)],
  ["scaffold", 64, 48, () => scaffold(0, 0)],
  ["shrine_block", 64, 64, () => shrine(0, 0)],
  [
    "path_stones",
    32,
    32,
    () => {
      oval(2, 4, 15, 6, C.stone);
      oval(16, 17, 14, 7, C.pale);
    },
  ],
  ["market_stall", 64, 48, () => stall(3, 0)],
  ["seed_crate", 32, 32, () => crate(8, 10)],
  [
    "signpost",
    32,
    32,
    () => {
      box(14, 10, 3, 22, C.earth);
      box(3, 8, 26, 10, C.wood);
    },
  ],
  [
    "glowing_node",
    8,
    8,
    () => {
      rect(1, 0, 6, 8, C.leaf);
      rect(0, 1, 8, 6, C.leaf);
      rect(2, 2, 4, 4, C.sprout);
    },
  ],
  ["cloud_small", 32, 16, () => cloud(0, 0)],
  ["cloud_large", 64, 16, () => cloud(0, 0, true)],
  [
    "distant_island",
    64,
    32,
    () => {
      oval(0, 0, 64, 12, C.sprout);
      oval(10, 8, 43, 22, C.water);
    },
  ],
  [
    "mountain_strip",
    64,
    32,
    () => {
      for (let i = 0; i < 32; i++) rect(32 - i, i, i * 2, 1, C.water);
    },
  ],
  [
    "coin",
    6,
    6,
    () => {
      rect(1, 0, 4, 6, C.sprout);
      rect(0, 1, 6, 4, C.sprout);
      rect(1, 1, 4, 4, C.leaf);
    },
  ],
  [
    "sprout_emote",
    16,
    16,
    () => {
      rect(8, 7, 1, 8, C.sprout);
      rect(3, 4, 5, 3, C.leaf);
      rect(9, 2, 5, 3, C.leaf);
    },
  ],
  ["tool_rack", 32, 32, () => rack(0, 0)],
  ["seedbed", 64, 32, () => bed(0, 0)],
];
for (let i = 0; i < 4; i++)
  tiles.push([
    `ring_${i}`,
    16,
    16,
    () => {
      const r = 3 + i;
      for (let y = -r; y <= r; y++)
        for (let x = -r; x <= r; x++)
          if (Math.abs(x * x + y * y - r * r) < r) rect(8 + x, 8 + y, 1, 1, C.sprout);
    },
  ]);
for (let i = 0; i < tiles.length; i++) {
  const [name, w, h, draw] = tiles[i]!;
  clipWidth = w;
  clipHeight = h;
  ox = (i % 16) * 64;
  oy = 384 + Math.floor(i / 16) * 64;
  frames[name] = { x: ox, y: oy, w, h };
  draw();
}
const glyphs: Record<string, string> = {
  A: "01110 10001 10001 11111 10001 10001 10001",
  B: "11110 10001 10001 11110 10001 10001 11110",
  C: "01111 10000 10000 10000 10000 10000 01111",
  D: "11110 10001 10001 10001 10001 10001 11110",
  E: "11111 10000 10000 11110 10000 10000 11111",
  F: "11111 10000 10000 11110 10000 10000 10000",
  G: "01111 10000 10000 10111 10001 10001 01110",
  H: "10001 10001 10001 11111 10001 10001 10001",
  I: "11111 00100 00100 00100 00100 00100 11111",
  J: "00111 00010 00010 00010 10010 10010 01100",
  K: "10001 10010 10100 11000 10100 10010 10001",
  L: "10000 10000 10000 10000 10000 10000 11111",
  M: "10001 11011 10101 10101 10001 10001 10001",
  N: "10001 11001 10101 10011 10001 10001 10001",
  O: "01110 10001 10001 10001 10001 10001 01110",
  P: "11110 10001 10001 11110 10000 10000 10000",
  Q: "01110 10001 10001 10001 10101 10010 01101",
  R: "11110 10001 10001 11110 10100 10010 10001",
  S: "01111 10000 10000 01110 00001 00001 11110",
  T: "11111 00100 00100 00100 00100 00100 00100",
  U: "10001 10001 10001 10001 10001 10001 01110",
  V: "10001 10001 10001 10001 10001 01010 00100",
  W: "10001 10001 10001 10101 10101 11011 10001",
  X: "10001 10001 01010 00100 01010 10001 10001",
  Y: "10001 10001 01010 00100 00100 00100 00100",
  Z: "11111 00001 00010 00100 01000 10000 11111",
  "0": "01110 10001 10011 10101 11001 10001 01110",
  "1": "00100 01100 00100 00100 00100 00100 01110",
  "2": "01110 10001 00001 00010 00100 01000 11111",
  "3": "11110 00001 00001 01110 00001 00001 11110",
  "4": "00010 00110 01010 10010 11111 00010 00010",
  "5": "11111 10000 10000 11110 00001 00001 11110",
  "6": "01110 10000 10000 11110 10001 10001 01110",
  "7": "11111 00001 00010 00100 01000 01000 01000",
  "8": "01110 10001 10001 01110 10001 10001 01110",
  "9": "01110 10001 10001 01111 00001 00001 01110",
  ".": "00000 00000 00000 00000 00000 00110 00110",
  "?": "01110 10001 00001 00010 00100 00000 00100",
  "!": "00100 00100 00100 00100 00100 00000 00100",
  "-": "00000 00000 00000 11111 00000 00000 00000",
  "'": "00100 00100 00000 00000 00000 00000 00000",
  ",": "00000 00000 00000 00000 00100 00100 01000",
  ":": "00000 00100 00000 00000 00100 00000 00000",
  "/": "00001 00010 00010 00100 01000 01000 10000",
  "→": "00000 00100 00010 11111 00010 00100 00000",
};
let gi = 0;
for (const [ch, rows] of Object.entries(glyphs)) {
  clipWidth = 5;
  clipHeight = 7;
  ox = gi * 6;
  oy = 600;
  frames[`glyph_${ch}`] = { x: ox, y: oy, w: 5, h: 7 };
  rows.split(" ").forEach((row, y) =>
    [...row].forEach((p, x) => {
      if (p === "1") rect(x, y, 1, 1, C.sprout);
    }),
  );
  gi++;
}
mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, "atlas.png"), encodePng(W, H, pixels));
writeFileSync(
  resolve(OUT, "atlas.json"),
  JSON.stringify({ frames, tileSize: 32, palette: C }, null, 2) + "\n",
);
