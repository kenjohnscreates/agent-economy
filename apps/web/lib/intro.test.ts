import { describe, expect, it } from "vitest";
import { introMode, videoIntroFinished } from "./intro";

describe("coastal intro lifecycle", () => {
  it("waits for both the supplied movie ending and the map, except in reduced motion", () => {
    expect(videoIntroFinished(true, false, false)).toBe(false);
    expect(videoIntroFinished(false, true, false)).toBe(false);
    expect(videoIntroFinished(true, true, false)).toBe(true);
    expect(videoIntroFinished(true, false, true)).toBe(true);
    expect(videoIntroFinished(false, false, true)).toBe(false);
  });
  it("honors explicit links before the per-tab preference", () => {
    expect(introMode("?intro=force", true)).toBe(true);
    expect(introMode("?intro=skip", false)).toBe(false);
    expect(introMode("", true)).toBe(false);
    expect(introMode("", false)).toBe(true);
  });
});
