// Fixture-driven PRD §5 role rules: buy/post_job/complete_job/loan/repay/accept/deliver/
// deposit/approve/flag/mark_default/stipend/set_rate. decide is pure — no fetch.
import {
  BASE_RATE_SPREAD_BPS,
  computeBaseRateBps,
  computeTownRateBps,
  DEFAULT_PREMIUM_BPS,
  rosterEntry,
  STIPEND_USDC,
} from "@agent-town/shared";
import { describe, expect, it } from "vitest";
import { decide, ProposedActionSchema, type TickContext } from "./decide.js";
import {
  emptyWorld,
  loadWorld,
  normaliseDexVolume,
  priceFromSignals,
  type WorldLoan,
  type WorldState,
} from "./world.js";

const gus = rosterEntry("gus");
const bo = rosterEntry("bo");
const cy = rosterEntry("cy");
const dee = rosterEntry("dee");
const eli = rosterEntry("eli");
const fay = rosterEntry("fay");
const ada = rosterEntry("ada");

function ctx(world: WorldState, phase: TickContext["phase"] = "boom"): TickContext {
  return { tick: world.tick, phase, world };
}

function kinds(agent: ReturnType<typeof rosterEntry>, world: WorldState): string[] {
  return decide(agent, ctx(world)).map((a) => a.kind);
}

const pendingLoan = (over: Partial<WorldLoan> = {}): WorldLoan => ({
  id: "L-1",
  borrower: "bo",
  principalUsdc: "1200000",
  status: "pending",
  approvedAtTick: null,
  ...over,
});

describe("empty world", () => {
  it("every roster role idles (keeps engine default idle)", () => {
    const world = emptyWorld(3);
    for (const agent of [gus, bo, dee, ada]) {
      expect(decide(agent, ctx(world))).toEqual([{ kind: "idle" }]);
    }
  });
});

describe("consumer (PRD §5)", () => {
  it("rich (balance > price × 2) → buy 1 good", () => {
    const world = loadWorld(1, {
      merchantPriceUsdc: "500000",
      balances: { gus: "1000001" },
      inventory: { bo: 5 },
    });
    const actions = decide(gus, ctx(world));
    expect(actions).toEqual([{ kind: "buy", amountUsdc: "500000", to: "bo" }]);
    expect(ProposedActionSchema.parse(actions[0])).toEqual(actions[0]);
  });

  it("poor (balance ≤ price × 2) → idle; equal is not enough", () => {
    const world = loadWorld(1, {
      merchantPriceUsdc: "500000",
      balances: { gus: "1000000" },
    });
    expect(decide(gus, ctx(world))).toEqual([{ kind: "idle" }]);
    expect(decide(rosterEntry("hal"), ctx(loadWorld(1, { merchantPriceUsdc: "500000" })))).toEqual([
      { kind: "idle" },
    ]);
  });
});

describe("merchant (PRD §5)", () => {
  it("inventory 1 + cash ≥ pay → post_job + fund_escrow (pay = cost × 1.2)", () => {
    const world = loadWorld(1, {
      restockCostUsdc: "1000000",
      inventory: { bo: 1 },
      balances: { bo: "2000000" },
    });
    expect(decide(bo, ctx(world))).toEqual([
      { kind: "post_job", amountUsdc: "1200000" },
      { kind: "fund_escrow", amountUsdc: "1200000" },
    ]);
  });

  it("inventory 1 + cash < job pay → post_job + request_loan", () => {
    const world = loadWorld(1, {
      restockCostUsdc: "1000000",
      inventory: { bo: 1 },
      balances: { bo: "1000000" },
    });
    expect(kinds(bo, world)).toEqual(["post_job", "request_loan"]);
  });

  it("cash > loan × 1.5 → repay; cash == 1.5× stays idle", () => {
    const loan: WorldLoan = {
      id: "L-9",
      borrower: "bo",
      principalUsdc: "1000000",
      status: "approved",
      approvedAtTick: 1,
    };
    const rich = loadWorld(5, {
      inventory: { bo: 4 },
      balances: { bo: "1500001" },
      loans: [loan],
    });
    expect(decide(bo, ctx(rich))).toEqual([
      { kind: "repay", loanId: "L-9", amountUsdc: "1000000" },
    ]);
    const exact = loadWorld(5, {
      inventory: { bo: 4 },
      balances: { bo: "1500000" },
      loans: [loan],
    });
    expect(decide(bo, ctx(exact))).toEqual([{ kind: "idle" }]);
  });

  it("client merchant emits complete_job for submitted; ignores open/funded/completed", () => {
    const submitted = loadWorld(3, {
      inventory: { bo: 4, cy: 4 },
      jobs: [
        { id: "J-b", client: "bo", provider: "dee", amountUsdc: "1000000", status: "submitted" },
        { id: "J-a", client: "bo", provider: "eli", amountUsdc: "2000000", status: "submitted" },
        { id: "J-cy", client: "cy", provider: "dee", amountUsdc: "9000000", status: "submitted" },
      ],
    });
    expect(decide(bo, ctx(submitted))).toEqual([{ kind: "complete_job", jobId: "J-a" }]);
    expect(decide(cy, ctx(submitted))).toEqual([{ kind: "complete_job", jobId: "J-cy" }]);

    for (const status of ["open", "funded", "completed"] as const) {
      expect(
        decide(
          bo,
          ctx(
            loadWorld(3, {
              inventory: { bo: 4 },
              jobs: [{ id: "J-x", client: "bo", provider: "dee", amountUsdc: "1000000", status }],
            }),
          ),
        ),
      ).toEqual([{ kind: "idle" }]);
    }
  });
});

describe("worker (PRD §5)", () => {
  it("picks the highest-pay funded unassigned town job; ignores open and non-roster clients", () => {
    const world = loadWorld(2, {
      jobs: [
        { id: "J-low", client: "bo", provider: "", amountUsdc: "1000000", status: "funded" },
        { id: "J-high", client: "cy", provider: "", amountUsdc: "2500000", status: "funded" },
        { id: "J-open", client: "bo", provider: "", amountUsdc: "4000000", status: "open" },
        { id: "J-noise", client: "0xdead", provider: "", amountUsdc: "9000000", status: "funded" },
        { id: "J-named", client: "bo", provider: "eli", amountUsdc: "8000000", status: "funded" },
      ],
    });
    expect(decide(dee, ctx(world))).toEqual([
      { kind: "accept_job", jobId: "J-high", amountUsdc: "2500000" },
    ]);
  });

  it("delivers on acceptTick + WORKER_DELIVER_TICKS (1)", () => {
    const world = loadWorld(5, {
      assignments: [{ jobId: "J-2", worker: "dee", acceptedAtTick: 4 }],
    });
    expect(decide(dee, ctx(world))).toEqual([{ kind: "deliver", jobId: "J-2" }]);
    expect(decide(dee, ctx(loadWorld(4, { assignments: world.assignments })))).toEqual([
      { kind: "idle" },
    ]);
  });

  it("deposits 20% of settled payout this tick", () => {
    const world = loadWorld(6, { settledPayouts: { dee: "1200000" } });
    expect(decide(dee, ctx(world))).toEqual([{ kind: "deposit", amountUsdc: "240000" }]);
  });

  it("no open job and nothing to deliver/deposit → idle", () => {
    expect(decide(dee, ctx(emptyWorld(1)))).toEqual([{ kind: "idle" }]);
  });

  it("accepts funded unassigned roster jobs; ignores open/submitted/completed/rejected", () => {
    const world = loadWorld(2, {
      jobs: [
        { id: "J-open", client: "bo", provider: "", amountUsdc: "1000000", status: "open" },
        { id: "J-funded", client: "cy", provider: "", amountUsdc: "3000000", status: "funded" },
        { id: "J-sub", client: "bo", provider: "", amountUsdc: "9000000", status: "submitted" },
        { id: "J-done", client: "cy", provider: "", amountUsdc: "8000000", status: "completed" },
        { id: "J-rej", client: "bo", provider: "", amountUsdc: "7000000", status: "rejected" },
      ],
    });
    expect(decide(dee, ctx(world))).toEqual([
      { kind: "accept_job", jobId: "J-funded", amountUsdc: "3000000" },
    ]);
  });

  it("named roster provider delivers instead of setProvider; empty provider is highest-pay funded", () => {
    const named = loadWorld(2, {
      jobs: [
        { id: "J-dee", client: "bo", provider: "dee", amountUsdc: "1000000", status: "funded" },
        { id: "J-eli", client: "cy", provider: "eli", amountUsdc: "9000000", status: "funded" },
      ],
    });
    expect(decide(dee, ctx(named))).toEqual([{ kind: "deliver", jobId: "J-dee" }]);
    expect(decide(eli, ctx(named))).toEqual([{ kind: "deliver", jobId: "J-eli" }]);
    expect(decide(fay, ctx(named))).toEqual([{ kind: "idle" }]);

    const openMarket = loadWorld(2, {
      jobs: [
        { id: "J-low", client: "bo", provider: "", amountUsdc: "1000000", status: "open" },
        { id: "J-high", client: "cy", provider: "", amountUsdc: "2500000", status: "funded" },
      ],
    });
    expect(decide(dee, ctx(openMarket))).toEqual([
      { kind: "accept_job", jobId: "J-high", amountUsdc: "2500000" },
    ]);
    expect(decide(eli, ctx(openMarket))).toEqual([
      { kind: "accept_job", jobId: "J-high", amountUsdc: "2500000" },
    ]);
  });

  it("does not accept a job whose provider is a foreign address", () => {
    const world = loadWorld(2, {
      jobs: [
        {
          id: "185900",
          client: "bo",
          provider: "0x1111111111111111111111111111111111111111",
          amountUsdc: "3000000",
          status: "funded",
        },
      ],
    });
    expect(decide(dee, ctx(world))).toEqual([{ kind: "idle" }]);
  });
});

describe("treasurer (PRD §5)", () => {
  it("score 70 + util 20% → approve_loan", () => {
    const world = loadWorld(1, {
      loans: [pendingLoan()],
      creditScores: { bo: 70 },
      treasury: {
        utilisationBps: 2000,
        outstandingUsdc: "0",
        baseRateBps: computeBaseRateBps(0),
        defaults: 0,
      },
    });
    expect(decide(ada, ctx(world))).toEqual([
      { kind: "approve_loan", loanId: "L-1", amountUsdc: "1200000" },
    ]);
  });

  it("score 50 → flag (neither approve nor deny)", () => {
    const world = loadWorld(1, {
      loans: [pendingLoan()],
      creditScores: { bo: 50 },
      treasury: {
        utilisationBps: 2000,
        outstandingUsdc: "0",
        baseRateBps: computeBaseRateBps(0),
        defaults: 0,
      },
    });
    const actions = decide(ada, ctx(world));
    expect(kinds(ada, world)).toEqual(["idle"]);
    expect(actions.some((a) => a.kind === "approve_loan" || a.kind === "deny_loan")).toBe(false);
  });

  it("util 85% → flag even with score 70", () => {
    const world = loadWorld(1, {
      loans: [pendingLoan()],
      creditScores: { bo: 70 },
      treasury: {
        utilisationBps: 8500,
        outstandingUsdc: "1",
        baseRateBps: computeBaseRateBps(0),
        defaults: 0,
      },
    });
    expect(kinds(ada, world)).toEqual(["idle"]);
  });

  it("mark_default at approvedAt + LOAN_TERM + GRACE (t1 → t7)", () => {
    const loan: WorldLoan = {
      id: "L-2",
      borrower: "fay",
      principalUsdc: "1000000",
      status: "approved",
      approvedAtTick: 1,
    };
    const t7 = loadWorld(7, {
      loans: [loan],
      treasury: {
        utilisationBps: 0,
        outstandingUsdc: "1000000",
        baseRateBps: computeBaseRateBps(0),
        defaults: 0,
      },
    });
    expect(decide(ada, ctx(t7))).toEqual([
      { kind: "mark_default", loanId: "L-2", amountUsdc: "1000000" },
    ]);
    const t6 = loadWorld(6, { loans: [loan], treasury: t7.treasury });
    expect(kinds(ada, t6)).toEqual(["idle"]);
  });

  it("does not markDefault bo (2nd default would revokeName)", () => {
    const loan: WorldLoan = {
      id: "L-bo",
      borrower: "bo",
      principalUsdc: "1200000",
      status: "approved",
      approvedAtTick: 1,
    };
    const t7 = loadWorld(7, {
      loans: [loan],
      treasury: {
        utilisationBps: 0,
        outstandingUsdc: "1200000",
        baseRateBps: computeBaseRateBps(0),
        defaults: 0,
      },
    });
    expect(kinds(ada, t7)).toEqual(["idle"]);
  });

  it("set_rate when market APY + spread (+ default premium) ≠ on-chain", () => {
    const world = loadWorld(1, {
      signals: { usdcBorrowApyBps: 410, dexVolume24hUsd: "0", stale: false },
      treasury: {
        utilisationBps: 2000,
        outstandingUsdc: "0",
        baseRateBps: 200,
        defaults: 0,
      },
    });
    expect(decide(ada, ctx(world))).toEqual([{ kind: "set_rate", bps: computeBaseRateBps(410) }]);
    const hiked = loadWorld(1, {
      signals: { usdcBorrowApyBps: 410, dexVolume24hUsd: "0", stale: false },
      treasury: {
        utilisationBps: 2000,
        outstandingUsdc: "0",
        baseRateBps: 610,
        defaults: 1,
      },
    });
    expect(decide(ada, ctx(hiked))).toEqual([
      {
        kind: "set_rate",
        bps: computeTownRateBps({
          marketApyBps: 410,
          spreadBps: BASE_RATE_SPREAD_BPS,
          defaultPremiumBps: DEFAULT_PREMIUM_BPS,
        }),
      },
    ]);
  });

  it("pay_stipend on ticks 3/6/9 (tick % 3 === 0), not on 1/2/4", () => {
    const balances = { gus: "0", hal: "0" } as const;
    for (const tick of [3, 6, 9]) {
      expect(kinds(ada, loadWorld(tick, { balances }))).toEqual(["pay_stipend"]);
      expect(decide(ada, ctx(loadWorld(tick, { balances })))).toEqual([
        { kind: "pay_stipend", amountUsdc: STIPEND_USDC },
      ]);
    }
    for (const tick of [1, 2, 4]) {
      expect(kinds(ada, loadWorld(tick, { balances }))).toEqual(["idle"]);
    }
  });
});

describe("Signal C", () => {
  it("normalises DEX volume clamp(vol/1e8, 0, 1) without changing DEX_PRICE_K", () => {
    expect(normaliseDexVolume("0")).toBe(0);
    expect(normaliseDexVolume("50000000")).toBe(0.5);
    expect(normaliseDexVolume("184532211.55")).toBe(1);
    expect(priceFromSignals("500000", "0")).toBe("500000");
    expect(priceFromSignals("500000", "184532211.55")).toBe("750000");
  });

  it("stale signals do not throw; last-known APY/volume still drive rules", () => {
    const world = loadWorld(1, {
      merchantPriceUsdc: priceFromSignals("500000", "184532211.55"),
      balances: { gus: "2000000" },
      inventory: { bo: 3 },
      signals: { usdcBorrowApyBps: 410, dexVolume24hUsd: "184532211.55", stale: true },
      treasury: {
        utilisationBps: 0,
        outstandingUsdc: "0",
        baseRateBps: 200,
        defaults: 0,
      },
    });
    expect(() => decide(gus, ctx(world))).not.toThrow();
    expect(() => decide(ada, ctx(world))).not.toThrow();
    expect(kinds(gus, world)).toEqual(["buy"]);
    expect(decide(ada, ctx(world))).toEqual([{ kind: "set_rate", bps: 610 }]);
  });
});

describe("determinism", () => {
  it("same world+tick → identical ProposedAction[]", () => {
    const world = loadWorld(2, {
      merchantPriceUsdc: "500000",
      restockCostUsdc: "1000000",
      balances: { gus: "2000000", bo: "500000" },
      inventory: { bo: 1 },
      jobs: [
        { id: "J-a", client: "bo", provider: "", amountUsdc: "1000000", status: "funded" },
        { id: "J-b", client: "cy", provider: "", amountUsdc: "3000000", status: "funded" },
      ],
    });
    const a = decide(bo, ctx(world));
    const b = decide(bo, ctx(world));
    expect(a).toEqual(b);
    expect(decide(dee, ctx(world))).toEqual(decide(dee, ctx(world)));
    expect(decide(gus, ctx(world))).toEqual(decide(gus, ctx(world)));
  });
});
