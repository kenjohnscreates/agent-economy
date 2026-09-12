import { describe, expect, it } from "vitest";
import {
  depositReply,
  formatRateApr,
  illustrativeInterestUsdc,
  parseVisitorIntent,
  percentOf,
  validateVisitorLabel,
} from "./visitor.js";

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
  it("maps the 30-day payout sentence to 50%", () => {
    expect(
      parseVisitorIntent(
        "deposit 50% of our holdings into town bank and tell me the expected pay out based on the current rate for a 30 day holding period",
      ),
    ).toEqual({ kind: "deposit_percent", bps: 5_000 });
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
  it("maps create subagent scout", () => {
    expect(parseVisitorIntent("create subagent scout")).toEqual({
      kind: "create_subagent",
      label: "scout",
    });
    expect(parseVisitorIntent("mint subdomain worker")).toEqual({
      kind: "create_subagent",
      label: "worker",
    });
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

describe("illustrativeInterestUsdc", () => {
  it("matches TownTreasury 10 USDC × 600 bps × 30 days = 49315 (6-dec)", () => {
    expect(illustrativeInterestUsdc("10000000", 600)).toBe("49315");
  });
  it("formats the deposit reply with town rate", () => {
    expect(formatRateApr(810)).toBe("8.10%");
    const reply = depositReply("1000000", 810);
    expect(reply).toMatch(/1 USDC/);
    expect(reply).toMatch(/8\.10%/);
    expect(reply).toMatch(/0\.006657 USDC/);
    expect(reply).toMatch(/not credited on-chain/);
  });
});
