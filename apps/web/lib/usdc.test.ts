import { describe, expect, it } from "vitest";
import { formatBps, formatUsdc, formatUsdcShort, parseUsdc } from "./usdc";

describe("usdc", () => {
  it("formats 6-dec strings without floats", () => {
    expect(formatUsdc("3000000")).toBe("3.00");
    expect(formatUsdc("1860655")).toBe("1.86");
    expect(formatUsdc("42500000")).toBe("42.50");
    expect(formatUsdc("0")).toBe("0.00");
    expect(formatUsdc(null)).toBe("0.00");
    expect(formatUsdc("123456789012345678901")).toBe("123456789012345.67");
  });
  it("parses human amounts", () => {
    expect(parseUsdc("3")).toBe("3000000");
    expect(parseUsdc("3.5")).toBe("3500000");
    expect(parseUsdc("0.000001")).toBe("1");
    expect(() => parseUsdc("abc")).toThrow();
  });
  it("short and bps", () => {
    expect(formatUsdcShort("184538905000000")).toBe("184.5M");
    expect(formatUsdcShort("42500000")).toBe("42.50");
    expect(formatBps(610)).toBe("6.10%");
  });
});
