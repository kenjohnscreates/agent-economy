/**
 * Unit tests for Signal C fetch — mocked gateway, cache, stale fallback (M4.9).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignalsSchema } from "@agent-town/shared";
import {
  EXT_DEX_SUBGRAPH_ID,
  EXT_LENDING_SUBGRAPH_ID,
} from "../external.js";
import {
  fetchExternalSignals,
  resetExternalSignalsForTests,
} from "./fetchExternalSignals.js";
import { ratePercentToApyBps } from "./gateway.js";

const LENDING_BODY = {
  data: {
    market: {
      rates: [{ rate: "4.2991672066179983" }],
    },
  },
};

const DEX_BODY = {
  data: {
    poolDayDatas: [{ volumeUSD: "12706658.72996324119414257955524906" }],
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installGoodGatewayMock(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes(EXT_LENDING_SUBGRAPH_ID)) return jsonResponse(LENDING_BODY);
      if (url.includes(EXT_DEX_SUBGRAPH_ID)) return jsonResponse(DEX_BODY);
      return jsonResponse({ errors: [{ message: "unexpected url" }] }, 404);
    }),
  );
}

describe("ratePercentToApyBps", () => {
  it("rounds percent APY to integer bps", () => {
    expect(ratePercentToApyBps("4.2991672066179983")).toBe(430);
  });
});

describe("fetchExternalSignals (mocked gateway)", () => {
  beforeEach(() => {
    resetExternalSignalsForTests();
    vi.unstubAllGlobals();
    delete process.env.EXTERNAL_SIGNALS;
  });

  afterEach(() => {
    resetExternalSignalsForTests();
    vi.unstubAllGlobals();
    delete process.env.EXTERNAL_SIGNALS;
  });

  it("parses a successful gateway response as SignalsSchema", async () => {
    installGoodGatewayMock();

    const signals = await fetchExternalSignals({
      tick: 1,
      apiKey: "test-key",
      externalSignalsEnabled: true,
    });

    expect(SignalsSchema.safeParse(signals).success).toBe(true);
    expect(signals.usdcBorrowApyBps).toBe(430);
    expect(signals.dexVolume24hUsd).toBe("12706658.72996324119414257955524906");
    expect(signals.stale).toBe(false);
    expect(signals.sources.lending.subgraphId).toBe(EXT_LENDING_SUBGRAPH_ID);
    expect(signals.sources.lending.name).toBe("Aave V3 Ethereum");
    expect(signals.sources.dex.name).toBe("Uniswap V3 Ethereum");
  });

  it("reuses cache for the same tick without a second fetch", async () => {
    installGoodGatewayMock();

    await fetchExternalSignals({ tick: 42, apiKey: "test-key", externalSignalsEnabled: true });
    await fetchExternalSignals({ tick: 42, apiKey: "test-key", externalSignalsEnabled: true });

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
  });

  it("returns stale=true with last-known values after gateway 5xx", async () => {
    installGoodGatewayMock();
    const good = await fetchExternalSignals({
      tick: 1,
      apiKey: "test-key",
      externalSignalsEnabled: true,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ errors: [{ message: "boom" }] }, 500)),
    );

    const stale = await fetchExternalSignals({
      tick: 2,
      apiKey: "test-key",
      externalSignalsEnabled: true,
    });

    expect(stale.stale).toBe(true);
    expect(stale.usdcBorrowApyBps).toBe(good.usdcBorrowApyBps);
    expect(stale.dexVolume24hUsd).toBe(good.dexVolume24hUsd);
  });

  it("returns stale=true with last-known values after abort/timeout", async () => {
    installGoodGatewayMock();
    const good = await fetchExternalSignals({
      tick: 1,
      apiKey: "test-key",
      externalSignalsEnabled: true,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted.", "AbortError");
      }),
    );

    const stale = await fetchExternalSignals({
      tick: 3,
      apiKey: "test-key",
      externalSignalsEnabled: true,
    });

    expect(stale.stale).toBe(true);
    expect(stale.usdcBorrowApyBps).toBe(good.usdcBorrowApyBps);
  });

  it("skips network when EXTERNAL_SIGNALS=off", async () => {
    process.env.EXTERNAL_SIGNALS = "off";
    installGoodGatewayMock();

    const signals = await fetchExternalSignals({ tick: 5, apiKey: "test-key" });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(signals.stale).toBe(true);
    expect(signals.usdcBorrowApyBps).toBe(0);
    expect(signals.dexVolume24hUsd).toBe("0");
  });

  it("never throws to the caller", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    await expect(
      fetchExternalSignals({ tick: 9, apiKey: "test-key", externalSignalsEnabled: true }),
    ).resolves.toMatchObject({ stale: true });
  });
});
