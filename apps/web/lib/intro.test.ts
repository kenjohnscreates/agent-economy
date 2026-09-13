import { describe, expect, it } from "vitest";
import { enterPromptVisible, introMode } from "./intro";

describe("coastal intro lifecycle", () => {
  it("shows Enter after the clip ends, or immediately under reduced motion", () => {
    expect(enterPromptVisible(false, false)).toBe(false);
    expect(enterPromptVisible(true, false)).toBe(true);
    expect(enterPromptVisible(false, true)).toBe(true);
    expect(enterPromptVisible(true, true)).toBe(true);
  });
  it("honors explicit links before the per-tab preference", () => {
    expect(introMode("?intro=force", true)).toBe(true);
    expect(introMode("?intro=skip", false)).toBe(false);
    expect(introMode("", true)).toBe(false);
    expect(introMode("", false)).toBe(true);
  });
});
