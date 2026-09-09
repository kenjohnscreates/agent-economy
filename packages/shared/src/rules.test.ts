// Pure-function and constant checks for PRD §5 rules (Signal C formulas).
import { describe, expect, it } from "vitest";
import {
  ACTION_KINDS,
  BASE_RATE_MAX_BPS,
  BASE_RATE_MIN_BPS,
  GRACE_TICKS,
  LOAN_TERM_TICKS,
  computeBaseRateBps,
  computeMerchantPrice,
  computeTownRateBps,
} from "./rules.js";

describe("loan timing constants", () => {
  it("LOAN_TERM_TICKS=4, GRACE_TICKS=2 → approved t1 defaults t7 (PRD §12)", () => {
    expect(LOAN_TERM_TICKS).toBe(4);
    expect(1 + LOAN_TERM_TICKS + GRACE_TICKS).toBe(7);
  });
});

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

describe("computeTownRateBps", () => {
  it("= clamp(market + spread) + default premium (PRD §12: 4.1% + 2% + 2% → 8.1%)", () => {
    expect(computeTownRateBps({ marketApyBps: 410, spreadBps: 200, defaultPremiumBps: 200 })).toBe(
      810,
    );
    expect(computeTownRateBps({ marketApyBps: 410, spreadBps: 200, defaultPremiumBps: 0 })).toBe(
      computeBaseRateBps(410),
    );
  });
  it("clamps the base leg but adds the premium on top", () => {
    expect(computeTownRateBps({ marketApyBps: 5000, spreadBps: 200, defaultPremiumBps: 200 })).toBe(
      2200,
    );
    expect(computeTownRateBps({ marketApyBps: -900, spreadBps: 200, defaultPremiumBps: 0 })).toBe(
      BASE_RATE_MIN_BPS,
    );
  });
  it("ignores negative premium and non-finite input", () => {
    expect(computeTownRateBps({ marketApyBps: 410, spreadBps: 200, defaultPremiumBps: -50 })).toBe(
      610,
    );
    expect(
      computeTownRateBps({ marketApyBps: Number.NaN, spreadBps: 200, defaultPremiumBps: 0 }),
    ).toBe(BASE_RATE_MIN_BPS);
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
