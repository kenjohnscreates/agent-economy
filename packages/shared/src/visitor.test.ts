import { describe, expect, it } from "vitest";
import { parseVisitorIntent, percentOf, validateVisitorLabel } from "./visitor.js";

describe("validateVisitorLabel", () => {
  it("accepts kenny and ivy", () => {
    expect(validateVisitorLabel("Kenny")).toBe("kenny");
    expect(validateVisitorLabel(" ivy ")).toBe("ivy");
  });
  it("rejects reserved and short names", () => {
    expect(() => validateVisitorLabel("ada")).toThrow(/taken/);
    expect(() => validateVisitorLabel("bank")).toThrow(/taken/);
    expect(() => validateVisitorLabel("ab")).toThrow(/3–16/);
    expect(() => validateVisitorLabel("Ivy_1")).toThrow(/lowercase/);
  });
});

describe("parseVisitorIntent", () => {
  it("maps the demo line to 50%", () => {
    expect(parseVisitorIntent("deposit 50% of our usdc into the town bank")).toEqual({
      kind: "deposit_percent",
      bps: 5_000,
    });
  });
  it("maps half / all / amount / balance", () => {
    expect(parseVisitorIntent("put half in the bank")).toEqual({
      kind: "deposit_percent",
      bps: 5_000,
    });
    expect(parseVisitorIntent("deposit 50%")).toEqual({
      kind: "deposit_percent",
      bps: 5_000,
    });
    expect(parseVisitorIntent("deposit all into the treasury")).toEqual({
      kind: "deposit_percent",
      bps: 10_000,
    });
    expect(parseVisitorIntent("deposit 0.5 USDC in the bank")).toEqual({
      kind: "deposit_usdc",
      amountUsdc: "500000",
    });
    expect(parseVisitorIntent("what's my balance?")).toEqual({ kind: "balance" });
  });
  it("refuses loans and defaults", () => {
    const r = parseVisitorIntent("mark_default bo");
    expect(r.kind).toBe("refuse");
  });
});

describe("percentOf", () => {
  it("takes half of 2 USDC", () => {
    expect(percentOf("2000000", 5_000)).toBe("1000000");
  });
});
