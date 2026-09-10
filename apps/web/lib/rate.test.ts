import { describe, expect, it } from "vitest";
import type { Loan, RateBreakdown } from "@agent-town/shared";
import {
  decidedAtTick,
  formatAge,
  formatRateStack,
  formatUtc,
  groupLoans,
  latestVerdict,
  rateStack,
  upsertLoan,
  utilisationTone,
} from "./rate";

const rate: RateBreakdown = {
  marketApyBps: 410,
  spreadBps: 200,
  defaultPremiumBps: 200,
  utilisationBps: 860,
  baseRateBps: 610,
  townRateBps: 810,
};

const loan = (over: Partial<Loan>): Loan => ({
  id: "L-0",
  borrower: "bo",
  principalUsdc: "3000000",
  rateBps: 610,
  status: "approved",
  requestedAtTick: 4,
  approvedAtTick: 4,
  dueAtTick: 8,
  repaidUsdc: "0",
  defaultedAtTick: null,
  advisor: null,
  ...over,
});
const verdict = (reasoning: string) =>
  ({ decision: "approve", reasoning, confidence: 0.9, source: "llm" }) as const;

describe("rateStack", () => {
  it("stacks market + spread + premium into the town rate", () => {
    const s = rateStack(rate);
    expect(s.rows.map((r) => r.bps)).toEqual([410, 200, 200]);
    expect(s.sumBps).toBe(810);
    expect(s.clamped).toBe(false);
    expect(formatRateStack(rate)).toBe("4.10% + 2.00% + 2.00% = 8.10%");
  });
  it("flags a clamped base rate", () => {
    expect(rateStack({ ...rate, marketApyBps: 2500, townRateBps: 2200 }).clamped).toBe(true);
  });
});

describe("utilisationTone", () => {
  it("is ok below 60%, warn from 60%, danger at the 80% approval cap", () => {
    expect(utilisationTone(0)).toBe("ok");
    expect(utilisationTone(5999)).toBe("ok");
    expect(utilisationTone(6000)).toBe("warn");
    expect(utilisationTone(7999)).toBe("warn");
    expect(utilisationTone(8000)).toBe("danger");
  });
});

describe("formatAge / formatUtc", () => {
  const now = Date.parse("2026-09-08T18:02:00.000Z");
  it("humanises the fetch age", () => {
    expect(formatAge("2026-09-08T18:01:57.000Z", now)).toBe("just now");
    expect(formatAge("2026-09-08T18:01:45.000Z", now)).toBe("15s ago");
    expect(formatAge("2026-09-08T17:30:00.000Z", now)).toBe("32m ago");
    expect(formatAge("2026-09-08T10:02:00.000Z", now)).toBe("8h ago");
    expect(formatAge("2026-09-01T18:02:00.000Z", now)).toBe("7d ago");
    expect(formatAge("2026-09-08T18:05:00.000Z", now)).toBe("just now");
    expect(formatAge("nope", now)).toBe("unknown");
  });
  it("prints the absolute timestamp in UTC", () => {
    expect(formatUtc("2026-09-08T18:01:45.000Z")).toBe("2026-09-08 18:01:45 UTC");
    expect(formatUtc("nope")).toBe("nope");
  });
});

describe("loan book", () => {
  const loans: Loan[] = [
    loan({ id: "L-1", requestedAtTick: 4 }),
    loan({
      id: "L-2",
      status: "defaulted",
      requestedAtTick: 1,
      approvedAtTick: 1,
      dueAtTick: 5,
      defaultedAtTick: 7,
      advisor: verdict("Score 70 >= 60 and utilisation 15% < 80%."),
    }),
    loan({
      id: "L-3",
      status: "pending",
      requestedAtTick: 9,
      approvedAtTick: null,
      dueAtTick: null,
      advisor: verdict("Score 55, flag to the mayor."),
    }),
    loan({ id: "L-4", requestedAtTick: 6, approvedAtTick: 6, advisor: verdict("Fine.") }),
  ];
  it("buckets by status, newest request first", () => {
    const book = groupLoans(loans);
    expect(book.open.map((l) => l.id)).toEqual(["L-4", "L-1"]);
    expect(book.pending.map((l) => l.id)).toEqual(["L-3"]);
    expect(book.closed.map((l) => l.id)).toEqual(["L-2"]);
  });
  it("dates a decision by default, then approval, then request", () => {
    expect(decidedAtTick(loans[1]!)).toBe(7);
    expect(decidedAtTick(loans[2]!)).toBe(9);
    expect(decidedAtTick(loans[0]!)).toBe(4);
  });
  it("picks the most recent advisor verdict and ignores loans without one", () => {
    expect(latestVerdict(loans)?.id).toBe("L-3");
    expect(latestVerdict([loans[0]!])).toBeNull();
  });
  it("upserts a flagged loan by id without mutating the input", () => {
    const flagged = loan({ id: "L-1", status: "pending" });
    expect(upsertLoan(loans, flagged)[0]?.status).toBe("pending");
    expect(upsertLoan(loans, loan({ id: "L-9" }))).toHaveLength(5);
    expect(loans).toHaveLength(4);
    expect(loans[0]?.status).toBe("approved");
  });
});
