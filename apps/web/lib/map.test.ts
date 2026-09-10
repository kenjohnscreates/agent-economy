// M5.2 behavioral checks: bridge routing and bounded payment lifecycles.
// These tests run without a browser or GPU and use the real route/pool code.
import { describe, expect, it } from "vitest";
import { route, samplePath, BRIDGES } from "../components/map/paths";
import { CoinPool } from "../components/map/coins";

describe("bridge routing", () => {
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
