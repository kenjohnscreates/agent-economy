// Pure-function and constant checks for PRD §5 rules (Signal C formulas).
import { describe, expect, it } from "vitest";
import {
  ACTION_KINDS,
  BASE_RATE_MAX_BPS,
  BASE_RATE_MIN_BPS,
  computeBaseRateBps,
  computeMerchantPrice,
} from "./rules.js";

describe("computeBaseRateBps", () => {
  it("adds 200 bps spread to the market APY", () => {
    expect(computeBaseRateBps(410)).toBe(610);
  });
  it("clamps low", () => {
    expect(computeBaseRateBps(-500)).toBe(BASE_RATE_MIN_BPS);
    expect(computeBaseRateBps(0)).toBe(200);
  });
  it("clamps high", () => {
    expect(computeBaseRateBps(5000)).toBe(BASE_RATE_MAX_BPS);
    expect(computeBaseRateBps(1800)).toBe(2000);
  });
  it("falls back to min on non-finite input", () => {
    expect(computeBaseRateBps(Number.NaN)).toBe(BASE_RATE_MIN_BPS);
  });
});

describe("computeMerchantPrice", () => {
  it("returns base price at zero volume", () => {
    expect(computeMerchantPrice("500000", 0)).toBe("500000");
  });
  it("scales by 1 + k × volume (k = 0.5)", () => {
    expect(computeMerchantPrice("500000", 1)).toBe("750000");
    expect(computeMerchantPrice("500000", 0.12)).toBe("530000");
  });
  it("clamps volume into [0, 1] and keeps string output", () => {
    expect(computeMerchantPrice("1000000", 7)).toBe("1500000");
    expect(typeof computeMerchantPrice("1000000", 0.5)).toBe("string");
  });
});

describe("ACTION_KINDS", () => {
  it("has 18 unique kinds incl. idle", () => {
    expect(new Set(ACTION_KINDS).size).toBe(18);
    expect(ACTION_KINDS).toContain("idle");
  });
});
