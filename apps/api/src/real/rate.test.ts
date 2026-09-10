import {
  BASE_RATE_SPREAD_BPS,
  DEFAULT_PREMIUM_BPS,
  computeTownRateBps,
} from "@agent-town/shared";
import { describe, expect, it } from "vitest";
import { buildRateBreakdown } from "./rate.js";

describe("buildRateBreakdown", () => {
  it("does not double-count premium when on-chain base already includes it", () => {
    const marketApyBps = 439;
    const defaultPremiumBps = DEFAULT_PREMIUM_BPS;
    const pricedTown = computeTownRateBps({
      marketApyBps,
      spreadBps: BASE_RATE_SPREAD_BPS,
      defaultPremiumBps,
    });
    expect(pricedTown).toBe(839);

    const rate = buildRateBreakdown({
      marketApyBps,
      onChainBaseRateBps: pricedTown,
      defaults: 1,
      utilisationBps: 2500,
    });

    expect(rate.spreadBps).toBe(BASE_RATE_SPREAD_BPS);
    expect(rate.defaultPremiumBps).toBe(DEFAULT_PREMIUM_BPS);
    expect(rate.townRateBps).toBe(pricedTown);
    expect(rate.baseRateBps).toBe(pricedTown);

    const doubleCounted =
      marketApyBps + (pricedTown - marketApyBps) + defaultPremiumBps;
    expect(doubleCounted).toBe(1039);
    expect(rate.townRateBps).not.toBe(doubleCounted);
  });

  it("reports on-chain baseRateBps even when mayor-overridden", () => {
    const marketApyBps = 410;
    const rate = buildRateBreakdown({
      marketApyBps,
      onChainBaseRateBps: 900,
      defaults: 1,
      utilisationBps: 0,
    });
    expect(rate.spreadBps).toBe(200);
    expect(rate.baseRateBps).toBe(900);
    expect(rate.townRateBps).toBe(
      computeTownRateBps({
        marketApyBps,
        spreadBps: BASE_RATE_SPREAD_BPS,
        defaultPremiumBps: DEFAULT_PREMIUM_BPS,
      }),
    );
  });

  it("omits premium when defaults is 0", () => {
    const marketApyBps = 410;
    const rate = buildRateBreakdown({
      marketApyBps,
      onChainBaseRateBps: 610,
      defaults: 0,
      utilisationBps: 1000,
    });
    expect(rate.defaultPremiumBps).toBe(0);
    expect(rate.spreadBps).toBe(BASE_RATE_SPREAD_BPS);
    expect(rate.townRateBps).toBe(
      computeTownRateBps({
        marketApyBps,
        spreadBps: BASE_RATE_SPREAD_BPS,
        defaultPremiumBps: 0,
      }),
    );
  });
});
