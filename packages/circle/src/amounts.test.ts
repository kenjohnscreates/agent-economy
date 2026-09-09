import { describe, expect, it } from "vitest";
import {
  baseUnitsToDecimal,
  decimalToBaseUnits,
  fromUsdcDecimalString,
  nativeToDecimalString,
  toUsdcDecimalString,
} from "./amounts.js";

describe("USDC amount conversions (6-dec ERC-20 interface)", () => {
  it("base units → decimal string", () => {
    expect(toUsdcDecimalString("3000000")).toBe("3");
    expect(toUsdcDecimalString("3500000")).toBe("3.5");
    expect(toUsdcDecimalString("1")).toBe("0.000001");
    expect(toUsdcDecimalString("0")).toBe("0");
    expect(toUsdcDecimalString(123456789n)).toBe("123.456789");
  });

  it("decimal string → base units", () => {
    expect(fromUsdcDecimalString("3")).toBe("3000000");
    expect(fromUsdcDecimalString("3.5")).toBe("3500000");
    expect(fromUsdcDecimalString("0.000001")).toBe("1");
    expect(fromUsdcDecimalString("0")).toBe("0");
    expect(fromUsdcDecimalString("123.456789")).toBe("123456789");
  });

  it("round-trips", () => {
    for (const b of ["1", "999999", "1000000", "42000001"]) {
      expect(fromUsdcDecimalString(toUsdcDecimalString(b))).toBe(b);
    }
  });

  it("rejects malformed input and excess precision", () => {
    expect(() => toUsdcDecimalString("3.5")).toThrow();
    expect(() => toUsdcDecimalString("-1")).toThrow();
    expect(() => fromUsdcDecimalString("0.0000001")).toThrow(/exceeds 6 decimals/);
    expect(() => fromUsdcDecimalString("abc")).toThrow();
  });

  it("native 18-dec gas balance is NOT the 6-dec ERC-20 amount", () => {
    // 3 USDC as native wei (18 dec) vs 3 USDC as ERC-20 base units (6 dec): 1e12 apart.
    expect(nativeToDecimalString(3_000_000_000_000_000_000n)).toBe("3");
    expect(baseUnitsToDecimal("3000000", 6)).toBe("3");
    expect(baseUnitsToDecimal("3000000", 18)).toBe("0.000000000003");
    expect(decimalToBaseUnits("3", 18)).toBe("3000000000000000000");
  });
});
