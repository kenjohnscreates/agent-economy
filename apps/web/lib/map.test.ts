// M5.2 behavioral checks: bridge routing and bounded payment lifecycles.
// These tests run without a browser or GPU and use the real route/pool code.
import { describe, expect, it } from "vitest";
import { route, samplePath, BRIDGES } from "../components/map/paths";
import { CoinPool } from "../components/map/coins";
import { AgentMotion } from "../components/map/agents";
import { CHIP_GAP, MAP_HEIGHT, MAP_WIDTH, stackChips, type ChipBox } from "../components/map/hud";
import { FIXTURES, type AgentSummary } from "@agent-town/shared";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

describe("generated sprite sheets", () => {
  it("gives all eight agents distinct art and thirteen named 48px frames", () => {
    const hashes = new Set<string>();
    for (const name of ["ada", "bo", "cy", "dee", "eli", "fay", "gus", "hal"]) {
      const png = readFileSync(resolve("public/sprites", `${name}.png`));
      hashes.add(createHash("sha256").update(png).digest("hex"));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([624, 48]);
      const sheet = JSON.parse(readFileSync(resolve("public/sprites", `${name}.json`), "utf8"));
      expect(Object.keys(sheet.frames)).toHaveLength(13);
      expect(sheet.frames.emote_1).toEqual({ x: 576, y: 0, w: 48, h: 48 });
    }
    expect(hashes.size).toBe(8);
  });
});

describe("agent state transitions", () => {
  const data = (): AgentSummary => ({
    ...FIXTURES.agents[0]!,
    position: { building: "bank", x: 0.5, y: 0.5 },
    narration: null,
  });
  it("walks the bridge route and reaches the authoritative target in 750ms", () => {
    const start = data(),
      target = { x: 100, y: 220 };
    const motion = new AgentMotion(start, { x: 320, y: 84 });
    motion.set({ ...start, position: { building: "market", x: 0.4, y: 0.5 } }, target, false);
    motion.update(300, 8, false);
    expect(motion.progress).toBe(300);
    expect(motion.path.points).toContainEqual(BRIDGES[0]!.points[1]);
    motion.update(450, 8, false);
    expect({ x: motion.x, y: motion.y }).toEqual(target);
  });
  it("snaps immediately if reduced motion is enabled during a walk", () => {
    const start = data(),
      target = { x: 100, y: 220 };
    const moving = { ...start, position: { building: "market" as const, x: 0.4, y: 0.5 } };
    const motion = new AgentMotion(start, { x: 320, y: 84 });
    motion.set(moving, target, false);
    motion.update(100, 8, false);
    motion.set(moving, target, true);
    motion.update(0, 8, true);
    expect({ x: motion.x, y: motion.y, frame: motion.frame }).toEqual({
      ...target,
      frame: "idle_0",
    });
  });
  it("expires narration without restarting it on unrelated prop updates", () => {
    const start = data(),
      motion = new AgentMotion(start, { x: 320, y: 84 });
    const talking = { ...start, narration: "The books balance." };
    motion.set(talking, { x: 320, y: 84 }, false);
    motion.update(2000, 8, false);
    motion.set({ ...talking }, { x: 320, y: 84 }, false);
    expect(motion.speechUntil).toBe(3000);
    motion.update(1000, 8, false);
    expect(motion.elapsed < motion.speechUntil).toBe(false);
  });
  it("holds default eyes for two ticks, including in reduced motion", () => {
    const motion = new AgentMotion(data(), { x: 320, y: 84 });
    motion.defaultUntilTick = 9;
    motion.update(0, 7, true);
    expect(motion.frame).toBe("emote_1");
    motion.update(0, 8, true);
    expect(motion.frame).toBe("emote_1");
    motion.update(0, 9, true);
    expect(motion.frame).toBe("idle_0");
  });
  it("exposes the remaining bridge route for transactions during a crossing", () => {
    const start = data(),
      motion = new AgentMotion(start, { x: 320, y: 84 });
    motion.set(
      { ...start, position: { building: "market", x: 0.4, y: 0.5 } },
      { x: 100, y: 220 },
      false,
    );
    motion.update(100, 8, false);
    const tail = motion.approach();
    expect(tail[0]).toEqual({ x: motion.x, y: motion.y });
    expect(tail.at(-1)).toEqual({ x: 100, y: 220 });
    expect(tail).toContainEqual({ x: 215, y: 144 });
  });
});

describe("bridge routing", () => {
  it("copies only coordinates, without retaining a controller's previous paths", () => {
    const start = { x: 320, y: 84, previousPath: { retained: true } };
    const p = route("bank", start, "market", { x: 100, y: 220 });
    expect(p.points[0]).toEqual({ x: 320, y: 84 });
  });
  it("keeps exact endpoints and crosses the bank/market bridge", () => {
    const a = { x: 310, y: 90 },
      b = { x: 100, y: 220 };
    const p = route("bank", a, "market", b);
    expect(p.points[0]).toEqual(a);
    expect(p.points.at(-1)).toEqual(b);
    for (const point of BRIDGES[0]!.points) expect(p.points).toContainEqual(point);
  });
  it("reverses the same shortest route between opposite zones", () => {
    const a = { x: 320, y: 84 },
      b = { x: 320, y: 305 };
    expect(route("bank", a, "homes", b).points).toEqual(
      route("homes", b, "bank", a).points.slice().reverse(),
    );
  });
  it("does not detour for travel within an island", () => {
    const a = { x: 100, y: 200 },
      b = { x: 110, y: 220 };
    expect(route("market", a, "market", b).points).toEqual([a, b]);
  });
  it("samples by distance, clamps progress, and handles a stationary endpoint", () => {
    const a = { x: 100, y: 200 },
      b = { x: 110, y: 200 },
      out = { x: 0, y: 0 };
    const p = route("market", a, "market", b);
    samplePath(p, 0.5, out);
    expect(out).toEqual({ x: 105, y: 200 });
    samplePath(p, 2, out);
    expect(out).toEqual(b);
    samplePath(route("market", a, "market", a), 0.5, out);
    expect(out).toEqual(a);
  });
});

describe("coin lifecycle", () => {
  const path = () => route("market", { x: 100, y: 200 }, "market", { x: 200, y: 200 });
  it("caps concurrent flights at twenty and reuses its thirty-two slots", () => {
    const pool = new CoinPool();
    const slots = pool.slots.slice();
    for (let i = 0; i < 20; i++) expect(pool.spawn(path(), "0.53", false)).not.toBeNull();
    expect(pool.spawn(path(), "0.53", false)).toBeNull();
    pool.update(1400);
    expect(pool.activeCount).toBe(0);
    expect(pool.spawn(path(), "0.53", false)).toBe(slots[0]);
    expect(pool.slots).toHaveLength(32);
    expect(pool.slots.every((s, i) => s === slots[i])).toBe(true);
  });
  it("flies for 900ms then shows four arrival frames", () => {
    const pool = new CoinPool();
    const c = pool.spawn(path(), "0.53", false)!;
    pool.update(450);
    expect(c.x).toBe(150);
    expect(c.stage).toBe("flight");
    pool.update(450);
    expect(c.x).toBe(200);
    expect(c.stage).toBe("ring");
    pool.update(400);
    expect(c.active).toBe(false);
  });
  it("uses a static line for 400ms and clears flights on reduced-motion change", () => {
    const pool = new CoinPool();
    const c = pool.spawn(path(), "0.53", true)!;
    expect(c.stage).toBe("line");
    pool.update(399);
    expect(c.active).toBe(true);
    pool.update(1);
    expect(c.active).toBe(false);
    const flying = pool.spawn(path(), "0.53", false)!;
    pool.reduceMotion();
    expect(flying.stage).toBe("line");
    pool.update(400);
    expect(pool.activeCount).toBe(0);
  });
});

// M5.13: two agents standing together used to draw their speech chips on top of each
// other. stackChips is the whole of the new positioning rule, so it is tested directly.
describe("speech chip stacking", () => {
  const box = (x: number, y: number, width = 60, height = 13): ChipBox => ({
    x,
    y,
    width,
    height,
    visible: false,
  });
  const clear = (a: ChipBox, b: ChipBox): boolean =>
    a.x >= b.x + b.width || b.x >= a.x + a.width || a.y >= b.y + b.height || b.y >= a.y + a.height;
  const shown = (boxes: ChipBox[]): ChipBox[] => boxes.filter((b) => b.visible);

  it("leaves a chip that collides with nothing exactly where its agent asked", () => {
    const boxes = [box(200, 180), box(400, 180)];
    stackChips(boxes);
    expect(boxes.map((b) => ({ x: b.x, y: b.y, visible: b.visible }))).toEqual([
      { x: 200, y: 180, visible: true },
      { x: 400, y: 180, visible: true },
    ]);
  });

  it("rounds to whole pixels and keeps every chip inside the 640x360 frame", () => {
    const boxes = [box(-40, 180.4), box(MAP_WIDTH, 6.6), box(300, MAP_HEIGHT)];
    stackChips(boxes);
    for (const b of shown(boxes)) {
      expect(b.x).toBe(Math.round(b.x));
      expect(b.y).toBe(Math.round(b.y));
      expect(b.x).toBeGreaterThanOrEqual(1);
      expect(b.y).toBeGreaterThanOrEqual(1);
      expect(b.x + b.width).toBeLessThanOrEqual(MAP_WIDTH - 1);
      expect(b.y + b.height).toBeLessThanOrEqual(MAP_HEIGHT - 1);
    }
  });

  it("lifts a colliding chip clear of the newer one and keeps the gap", () => {
    const boxes = [box(200, 180), box(210, 180)];
    stackChips(boxes);
    expect(boxes[0]).toMatchObject({ x: 200, y: 180, visible: true });
    expect(boxes[1]).toMatchObject({ x: 210, y: 180 - 13 - CHIP_GAP, visible: true });
    expect(clear(boxes[0]!, boxes[1]!)).toBe(true);
  });

  it("stacks a whole crowd asking for the same spot without a single overlap", () => {
    const boxes = Array.from({ length: 8 }, (_, i) => box(200 + i, 180));
    stackChips(boxes);
    const visible = shown(boxes);
    expect(visible).toHaveLength(8);
    for (let i = 0; i < visible.length; i++)
      for (let j = i + 1; j < visible.length; j++)
        expect(clear(visible[i]!, visible[j]!)).toBe(true);
    // Priority order survives: the newest chip is the lowest, nearest its own agent.
    expect(visible.map((b) => b.y)).toEqual([...visible.map((b) => b.y)].sort((a, b) => b - a));
  });

  it("hides a chip rather than overlap when the lift runs out of frame", () => {
    const boxes = Array.from({ length: 4 }, () => box(200, 40, 60, 23));
    stackChips(boxes);
    expect(boxes.map((b) => b.visible)).toEqual([true, true, false, false]);
    expect(shown(boxes).map((b) => b.y)).toEqual([40, 15]);
  });

  it("ignores chips that are already far enough apart sideways", () => {
    const boxes = [box(100, 180), box(100 + 60 + CHIP_GAP, 180)];
    stackChips(boxes);
    expect(boxes.map((b) => b.y)).toEqual([180, 180]);
  });

  it("respects the count argument so the loop can reuse one buffer", () => {
    const boxes = [box(200, 180), box(200, 180), box(200, 180)];
    stackChips(boxes, 2);
    expect(boxes[1]!.y).toBe(180 - 13 - CHIP_GAP);
    expect(boxes[2]).toMatchObject({ y: 180, visible: false });
  });

  it("is a pure function of the wanted rectangles, so a held frame never drifts", () => {
    const wanted = [box(200, 180), box(206, 180), box(212, 180)];
    const once = wanted.map((b) => ({ ...b }));
    stackChips(once);
    const twice = wanted.map((b) => ({ ...b }));
    stackChips(twice);
    expect(twice).toEqual(once);
    // Re-running on the already resolved boxes holds them still, so a frame that repeats
    // the same input cannot creep upwards.
    const settled = once.map((b) => ({ ...b }));
    stackChips(settled);
    expect(settled).toEqual(once);
  });
});
