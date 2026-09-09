/**
 * Live Signal C gateway smoke test (M4.9).
 * Skipped when GRAPH_API_KEY is unset; client created inside each `it`.
 */
import { describe, expect, it } from "vitest";
import { fetchExternalSignals } from "./fetchExternalSignals.js";

const hasGraphKey = Boolean(process.env.GRAPH_API_KEY?.trim());

describe.skipIf(!hasGraphKey)("live Signal C gateway", () => {
  it("returns non-negative APY bps and decimal volume string", async () => {
    const signals = await fetchExternalSignals({
      tick: 99_001,
      apiKey: process.env.GRAPH_API_KEY,
      externalSignalsEnabled: true,
    });

    expect(signals.stale).toBe(false);
    expect(signals.usdcBorrowApyBps).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(signals.usdcBorrowApyBps)).toBe(true);
    expect(signals.dexVolume24hUsd).toMatch(/^\d+(\.\d+)?$/);
    expect(signals.sources.lending.name).toBe("Aave V3 Ethereum");
    expect(signals.sources.dex.name).toBe("Uniswap V3 Ethereum");
  });
});
