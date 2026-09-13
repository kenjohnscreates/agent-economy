import { describe, expect, it } from "vitest";
import { introMode, introFinished, revealProgress } from "./intro";

describe("coastal intro lifecycle", () => {
  it("honors explicit links before the per-tab preference", () => {
    expect(introMode("?intro=force", true)).toBe(true);
    expect(introMode("?intro=skip", false)).toBe(false);
    expect(introMode("", true)).toBe(false);
    expect(introMode("", false)).toBe(true);
  });
  it("does not claim the town is ready just because the reveal ended", () => {
    expect(introFinished(9000, null, false)).toBe(false);
    expect(introFinished(9000, 8900, false)).toBe(false);
    expect(introFinished(9400, 8900, false)).toBe(true);
  });
  it("finishes fast-ready towns after the reveal and bypasses motion when requested", () => {
    expect(introFinished(2000, 0, false)).toBe(false);
    expect(introFinished(3000, 0, false)).toBe(true);
    expect(introFinished(0, 0, true)).toBe(true);
    expect(introFinished(1000, null, true)).toBe(false);
  });
  it("keeps the movie on its final frame and bounds seeking", () => {
    expect(revealProgress(-100, true)).toBe(0);
    expect(revealProgress(600, true)).toBe(0);
    expect(revealProgress(2600, true)).toBeCloseTo(0.5);
    expect(revealProgress(9000, true)).toBe(1);
  });
});
