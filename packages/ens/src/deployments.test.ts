// Guards deployments.json (hackathon-frozen set, R2): required keys, valid
// checksummable addresses, right chain. A typo here would silently point the
// registrar script at nothing / the wrong network.
import { isAddress } from "viem";
import { describe, expect, it } from "vitest";
import {
  REQUIRED_CONTRACTS,
  SEPOLIA_CHAIN_ID,
  addresses,
  deployments,
  loadDeployments,
  parseDeployments,
} from "./deployments.js";

describe("deployments loader", () => {
  it("targets Sepolia hackathon-frozen deployment", () => {
    expect(deployments.chainId).toBe(SEPOLIA_CHAIN_ID);
    expect(deployments.network).toBe("sepolia");
    expect(deployments.deployment).toBe("ensv2-hackathon-frozen");
  });

  it("has every required contract with a valid checksummed address", () => {
    for (const name of REQUIRED_CONTRACTS) {
      const addr = addresses[name];
      expect(addr, name).toBeDefined();
      expect(isAddress(addr, { strict: true }), `${name} checksum`).toBe(true);
      expect(addr, name).not.toMatch(/^0x0{40}$/);
    }
  });

  it("all addresses are unique (no copy-paste duplicates)", () => {
    const all = Object.values(addresses).map((a) => a.toLowerCase());
    expect(new Set(all).size).toBe(all.length);
  });

  it("loadDeployments() equals the eager singleton", () => {
    expect(loadDeployments().contracts.ETHRegistrar).toBe(addresses.ETHRegistrar);
  });

  it("rejects non-Sepolia chainId", () => {
    expect(() => parseDeployments({ ...deployments, chainId: 1 })).toThrow(/chainId/);
  });

  it("rejects missing required contract", () => {
    const contracts: Record<string, string> = { ...deployments.contracts };
    delete contracts.ETHRegistrar;
    expect(() => parseDeployments({ ...deployments, contracts })).toThrow(/ETHRegistrar/);
  });

  it("rejects malformed address", () => {
    const contracts = { ...deployments.contracts, MockUSDC: "0x1234" };
    expect(() => parseDeployments({ ...deployments, contracts })).toThrow(/MockUSDC/);
  });
});
