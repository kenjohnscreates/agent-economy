// Sanity tests for chain constants (ARCHITECTURE §2). Guards against typos in
// the USDC predeploy address, its decimals, and the ENSIP-11 coinType derivation.
import { describe, expect, it } from "vitest";
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_USDC_ADDRESS,
  ARC_USDC_DECIMALS,
  ENS_ARC_COIN_TYPE,
} from "./constants.js";

describe("chain constants", () => {
  it("USDC ERC-20 interface address matches ARCHITECTURE §2", () => {
    expect(ARC_USDC_ADDRESS).toBe("0x3600000000000000000000000000000000000000");
  });

  it("USDC ERC-20 interface has 6 decimals", () => {
    expect(ARC_USDC_DECIMALS).toBe(6);
  });

  it("ENS coinType for Arc follows ENSIP-11 (0x80000000 | chainId)", () => {
    expect(ENS_ARC_COIN_TYPE).toBe(0x80000000 + ARC_TESTNET_CHAIN_ID);
    expect(ENS_ARC_COIN_TYPE).toBe(2152525650);
  });
});
