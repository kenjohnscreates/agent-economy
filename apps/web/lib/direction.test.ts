import { describe, expect, it } from "vitest";
import { isMonetary, txDirection } from "./direction";

describe("txDirection", () => {
  it("routes money by kind", () => {
    expect(txDirection("buy", "gus", "bo")).toEqual({ from: "gus", to: "bo" });
    expect(txDirection("deposit", "dee", "treasury")).toEqual({ from: "dee", to: "treasury" });
    expect(txDirection("repay", "bo", "treasury")).toEqual({ from: "bo", to: "treasury" });
    expect(txDirection("approve_loan", "mayor", "cy")).toEqual({ from: "treasury", to: "cy" });
    expect(txDirection("pay_stipend", "ada", "hal")).toEqual({ from: "treasury", to: "hal" });
    expect(txDirection("complete_job", "bo", "eli")).toEqual({ from: "escrow", to: "eli" });
    expect(txDirection("fund_escrow", "bo", null)).toEqual({ from: "bo", to: "escrow" });
  });
  it("non-monetary kinds move nothing", () => {
    for (const k of [
      "post_job",
      "accept_job",
      "deny_loan",
      "mark_default",
      "set_rate",
      "idle",
    ] as const) {
      expect(txDirection(k, "x", "y")).toEqual({ from: null, to: null });
    }
    expect(
      isMonetary({ kind: "deny_loan", agent: "mayor", counterparty: "cy", amountUsdc: null }),
    ).toBe(false);
    expect(isMonetary({ kind: "buy", agent: "gus", counterparty: "bo", amountUsdc: "100" })).toBe(
      true,
    );
  });
});
