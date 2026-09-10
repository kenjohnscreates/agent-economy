import { describe, expect, it } from "vitest";
import { BASE_RATE_MAX_BPS, BASE_RATE_MIN_BPS } from "@agent-town/shared";
import { ApiRequestError } from "./api";
import {
  NOT_BROADCAST_MESSAGE,
  describeError,
  errorToast,
  fundBody,
  snapBps,
  txToast,
} from "./mayor";

describe("snapBps", () => {
  it("rounds to the 10 bps step and clamps to the shared band", () => {
    expect(snapBps(614)).toBe(610);
    expect(snapBps(615)).toBe(620);
    expect(snapBps(50)).toBe(BASE_RATE_MIN_BPS);
    expect(snapBps(99)).toBe(BASE_RATE_MIN_BPS);
    expect(snapBps(2001)).toBe(BASE_RATE_MAX_BPS);
    expect(snapBps(99999)).toBe(2000);
    expect(snapBps(Number.NaN)).toBe(100);
  });
});

describe("fundBody", () => {
  it("turns human USDC into the 6-decimal string body", () => {
    expect(fundBody("1")).toEqual({ amountUsdc: "1000000" });
    expect(fundBody("0.5")).toEqual({ amountUsdc: "500000" });
    expect(fundBody(" 12.345678 ")).toEqual({ amountUsdc: "12345678" });
  });
  it("rejects zero, negative and malformed input before any network call", () => {
    expect(() => fundBody("0")).toThrow(/more than 0/);
    expect(() => fundBody("0.000000")).toThrow(/more than 0/);
    expect(() => fundBody("-1")).toThrow(/not a USDC amount/);
    expect(() => fundBody("abc")).toThrow(/not a USDC amount/);
    expect(() => fundBody("1.2345678")).toThrow(/not a USDC amount/);
    expect(() => fundBody("")).toThrow(/not a USDC amount/);
  });
});

describe("toasts", () => {
  const res = {
    txHash: "0x8b37c5961810869c38573a9e61f8787515c718c5050877d870c7868ad0e10644",
    explorerUrl: "https://testnet.arcscan.app/tx/0x8b37c596",
  };
  it("builds the success toast with a 10-char hash and the explorer link", () => {
    expect(txToast("Fund", res)).toEqual({
      tone: "ok",
      title: "Fund · 0x8b37c596…",
      href: "https://testnet.arcscan.app/tx/0x8b37c596",
    });
  });
  it("maps a 501 to the ALLOW_BROADCAST message and other API errors to their text", () => {
    expect(describeError(new ApiRequestError(501, "NOT_IMPLEMENTED", "not implemented"))).toBe(
      NOT_BROADCAST_MESSAGE,
    );
    expect(describeError(new ApiRequestError(404, "NOT_FOUND", "Loan L-9 not found"))).toBe(
      "Loan L-9 not found (NOT_FOUND)",
    );
    expect(describeError(new Error("network down"))).toBe("network down");
    expect(describeError("odd")).toBe("odd");
    expect(errorToast("Approve L-3", new ApiRequestError(400, "BAD_REQUEST", "Loan L-3 is approved, not pending"))).toEqual({
      tone: "error",
      title: "Approve L-3 failed",
      detail: "Loan L-3 is approved, not pending (BAD_REQUEST)",
    });
  });
});
