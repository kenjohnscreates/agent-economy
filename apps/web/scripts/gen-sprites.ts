// Deterministic 48px robot strips, with named idle/walk/work/emote frames.
// Uses only the frozen roster and Botanica role colours. Never emits a logo.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ROSTER, type Role } from "@agent-town/shared";
import { encodePng } from "./png";
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../public/sprites");
const F = 0x0b2e1b,
  G = 0x166534,
  L = 0x7cb342,
  S = 0xd9f0c6;
const WAY: Record<Role, number[]> = {
  treasurer: [0xd2d2cc, 0xa7a7a7, 0xf4f7ef, L, L],
  merchant: [G, F, L, L, 0xead9b7],
  worker: [0xf4f7ef, 0xa7a7a7, 0xffffff, 0x8b6f47, L],
  consumer: [0x7cc7e4, 0x38b2c4, S, F, S],
};
function draw(role: Role, variant: number, mode: string, frame: number) {
  const pixels = new Uint8Array(48 * 48 * 4);
  const rect = (x: number, y: number, w: number, h: number, c: number) => {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) {
        const px = x + dx,
          py = y + dy;
        if (px < 0 || py < 0 || px >= 48 || py >= 48) continue;
        const i = (py * 48 + px) * 4;
        pixels[i] = c >> 16;
        pixels[i + 1] = c >> 8;
        pixels[i + 2] = c;
        pixels[i + 3] = 255;
      }
  };
  const [base, originalShade, hi, emblem, eyes] = WAY[role] as [
    number,
    number,
    number,
    number,
    number,
  ];
  const shade =
    variant === 0
      ? originalShade
      : role === "worker"
        ? variant === 1
          ? 0x5a5a5a
          : 0xd2d2cc
        : role === "merchant"
          ? G
          : 0x1f6f7c;
  const bob = mode === "idle" && frame === 1 ? -1 : 0;
  const step = mode === "walk" ? [0, -1, 0, 1][frame]! : 0;
  const working = mode === "work" ? [0, -2, -3, -1][frame]! : 0;
  const box = (x: number, y: number, w: number, h: number, c: number) => {
    rect(x, y + bob, w, h, F);
    rect(x + 1, y + bob + 1, w - 2, h - 2, c);
    rect(x + w - 2, y + bob + 2, 1, h - 3, shade);
  };
  box(18, 38 + step, 5, 7, base);
  box(25, 38 - step, 5, 7, base);
  rect(17, 45 + step, 6, 2, shade);
  rect(25, 45 - step, 6, 2, shade);
  if (role === "worker" || role === "consumer") {
    box(30, 29, 6, 11, 0x8b6f47);
    rect(32, 30 + variant, 2, 2, 0xead9b7);
  }
  box(17, 28, 14, 12, base);
  rect(18, 29 + bob, 8, 1, hi);
  box(13, 29 - step, 5, 8, base);
  box(30, 29 + step + working, 5, 8, base);
  rect(14, 34 - step + bob, 3, 2, 0xa7a7a7);
  rect(31, 34 + step + working + bob, 3, 2, 0xa7a7a7);
  box(13, 36 - step, 5, 4, base);
  box(30, 36 + step + working, 5, 4, base);
  rect(22, 31 + bob, 4, 5, emblem);
  if (role === "treasurer") {
    rect(21, 31 + bob, 6, 3, L);
    rect(23, 36 + bob, 2, 1, L);
  }
  box(17, 15, 14, 13, base);
  rect(18, 15 + bob, 11, 1, hi);
  rect(19, 19 + bob, 10, 6, F);
  const squint = mode === "emote" && frame === 1;
  rect(20, 21 + bob, 2, squint ? 1 : 2, eyes);
  rect(26, 21 + bob, 2, squint ? 1 : 2, eyes);
  if (role === "merchant") {
    rect(16, 15 + bob, 16, 3, shade);
    rect(16, 18 + bob, 2, 9, shade);
    rect(30, 18 + bob, 2, 9, shade);
    rect(17, 15 + bob, 8 + variant, 1, L);
  }
  if (role === "consumer") {
    rect(18, 18 + bob, 12, 1, 0xead9b7);
    rect(19, 19 + bob, 1, 5, 0xead9b7);
    rect(28, 19 + bob, 1, 5, 0xead9b7);
  }
  const tilt = squint ? 2 : mode === "idle" ? frame % 2 : 0;
  rect(24, 11 + bob, 1, 4, G);
  rect(20 + tilt, 9 + bob + (squint ? 3 : 0), 4, 2, L);
  rect(25, 8 + bob + tilt, 4, 2, G);
  rect(25, 8 + bob + tilt, 3, 1, L);
  if (mode === "work") {
    if (role === "worker") {
      rect(33, 26 + working, 1, 8, 0x8b6f47);
      rect(31, 25 + working, 5, 3, 0xa7a7a7);
    }
    if (role === "merchant") {
      rect(34, 39 + working, 1, 3, G);
      rect(32, 38 + working, 3, 2, L);
    }
    if (role === "consumer") rect(29, 22, 4, 2, S);
    if (role === "treasurer") rect(22, 32, 2, 2, frame % 2 ? S : L);
  }
  return pixels;
}
mkdirSync(OUT, { recursive: true });
const seen: Partial<Record<Role, number>> = {};
for (const agent of ROSTER) {
  const variant = seen[agent.role] ?? 0;
  seen[agent.role] = variant + 1;
  const sheet = new Uint8Array(624 * 48 * 4);
  const frames: Record<string, { x: number; y: number; w: number; h: number }> = {};
  let index = 0;
  for (const [mode, count] of [
    ["idle", 3],
    ["walk", 4],
    ["work", 4],
    ["emote", 2],
  ] as const)
    for (let f = 0; f < count; f++) {
      const pixels = draw(agent.role, variant, mode, f);
      for (let y = 0; y < 48; y++)
        sheet.set(pixels.subarray(y * 192, (y + 1) * 192), (y * 624 + index * 48) * 4);
      frames[`${mode}_${f}`] = { x: index * 48, y: 0, w: 48, h: 48 };
      index++;
    }
  writeFileSync(resolve(OUT, `${agent.name}.png`), encodePng(624, 48, sheet));
  writeFileSync(
    resolve(OUT, `${agent.name}.json`),
    JSON.stringify({ frames, ground: 47, fps: 10 }, null, 2) + "\n",
  );
}
