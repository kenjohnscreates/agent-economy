import { describe, expect, it } from "vitest";
import { diffSseEvents, emptySseCursor } from "./sse.js";

const TX =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as const;

const scoreboard = {
  gdpUsdc: "0",
  treasuryBalanceUsdc: "0",
  outstandingUsdc: "0",
  defaults: 0,
  defaultRateBps: 0,
  baseRateBps: 600,
  ticks: 1,
  jobsCompleted: 0,
  loansOutstanding: 0,
  gdpSeries: [],
  signals: {
    usdcBorrowApyBps: 410,
    dexVolume24hUsd: "0",
    fetchedAt: "2026-09-08T18:00:00.000Z",
    stale: false,
    sources: {
      lending: { subgraphId: "l", name: "l" },
      dex: { subgraphId: "d", name: "d" },
    },
  },
  rate: {
    marketApyBps: 410,
    spreadBps: 190,
    defaultPremiumBps: 0,
    utilisationBps: 0,
    baseRateBps: 600,
    townRateBps: 600,
  },
};

describe("diffSseEvents", () => {
  it("seeds cursor on first refresh without emitting", () => {
    const cursor = emptySseCursor();
    const events = diffSseEvents({
      cursor,
      tick: 1,
      phase: "boom",
      actions: [],
      narrations: [],
      loans: [],
      scoreboard,
    });
    expect(events).toHaveLength(0);
    expect(cursor.initialized).toBe(true);
  });

  it("emits tick, tx, narration, loan_flagged on subsequent refresh", () => {
    const cursor = emptySseCursor();
    diffSseEvents({
      cursor,
      tick: 1,
      phase: "boom",
      actions: [],
      narrations: [],
      loans: [],
      scoreboard,
    });

    const events = diffSseEvents({
      cursor,
      tick: 2,
      phase: "borrow",
      actions: [
        {
          tick: 2,
          agent: "bo",
          kind: "buy",
          tx: TX,
          status: "complete",
        },
      ],
      narrations: [{ tick: 2, agent: "bo", text: "Shopping!" }],
      loans: [
        {
          id: "L-9",
          borrower: "cy",
          principalUsdc: "2000000",
          rateBps: 600,
          status: "pending",
          requestedAtTick: 2,
          approvedAtTick: null,
          dueAtTick: null,
          repaidUsdc: "0",
          defaultedAtTick: null,
          advisor: null,
        },
      ],
      scoreboard: { ...scoreboard, ticks: 2 },
    });

    expect(events.map((e) => e.event)).toEqual([
      "tick",
      "tx",
      "narration",
      "loan_flagged",
      "scoreboard",
    ]);
  });
});
