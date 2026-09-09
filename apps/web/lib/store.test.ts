import { describe, expect, it } from "vitest";
import { FIXTURES } from "@agent-town/shared";
import { FEED_CAP, initialState, reduce } from "./store";

const H = "0x" + "ab".repeat(32);

describe("reduce", () => {
  it("agents snapshot sets order and keeps a newer bubble", () => {
    let s = reduce(initialState(), { event: "agents", data: FIXTURES.agents });
    expect(s.order[0]).toBe("ada");
    s = reduce(s, { event: "narration", data: { tick: 8, agent: "ada", text: "Books balanced." } });
    expect(s.agents["ada"]?.narration).toBe("Books balanced.");
    const wiped = FIXTURES.agents.map((a) => ({ ...a, narration: null }));
    s = reduce(s, { event: "agents", data: wiped });
    expect(s.agents["ada"]?.narration).toBe("Books balanced.");
  });

  it("tick, tx, scoreboard, loan_flagged update the right slices", () => {
    let s = reduce(initialState(), { event: "tick", data: { tick: 3, phase: "boom" } });
    expect(s.tick).toBe(3);
    s = reduce(s, {
      event: "tx",
      data: {
        tick: 3,
        agent: "gus",
        kind: "buy",
        amountUsdc: "530000",
        counterparty: "bo",
        txHash: H,
        explorerUrl: "https://testnet.arcscan.app/tx/" + H,
        status: "complete",
      },
    });
    expect(s.lastTx?.kind).toBe("buy");
    expect(s.feed.length).toBe(2);
    s = reduce(s, { event: "scoreboard", data: FIXTURES.scoreboard });
    expect(s.scoreboard?.rate.townRateBps).toBe(FIXTURES.scoreboard.rate.townRateBps);
    const loan = { ...FIXTURES.loans[0]!, id: "L-9", status: "pending" as const };
    s = reduce(s, { event: "loan_flagged", data: loan });
    expect(s.pendingLoans.map((l) => l.id)).toEqual(["L-9"]);
    s = reduce(s, { event: "loans", data: [{ ...loan, status: "approved" }] });
    expect(s.pendingLoans).toEqual([]);
  });

  it("feed is capped", () => {
    let s = initialState();
    for (let i = 0; i < FEED_CAP + 25; i++)
      s = reduce(s, { event: "tick", data: { tick: i, phase: "boom" } });
    expect(s.feed.length).toBe(FEED_CAP);
    expect(s.feed[0]?.event.event === "tick" && s.feed[0].event.data.tick).toBe(25);
  });
});
