// makeCommitment() must byte-match ETHRegistrar.makeCommitment() or --register
// would revert CommitmentTooOld (unknown hash). Two checks:
//  1. fixed vector produced by `cast call` against the hackathon registrar (offline)
//  2. live eth_call against the same contract (skipped if no network)
import { createPublicClient, http, zeroAddress } from "viem";
import { sepolia } from "viem/chains";
import { describe, expect, it } from "vitest";
import { ethRegistrarAbi } from "./abi/ethRegistrar.js";
import { commitWindow, makeCommitment, ZERO_BYTES32, type CommitmentParams } from "./commitment.js";
import { addresses } from "./deployments.js";

const vector: CommitmentParams = {
  label: "botanica",
  owner: "0x0000000000000000000000000000000000000001",
  secret: "0x0000000000000000000000000000000000000000000000000000000000000002",
  subregistry: zeroAddress,
  resolver: zeroAddress,
  duration: 31536000n,
  referrer: ZERO_BYTES32,
};

// cast call 0x7d1b…270b 'makeCommitment(string,address,bytes32,address,address,uint64,bytes32)(bytes32)' \
//   botanica 0x…01 0x…02 0x0 0x0 31536000 0x0 --rpc-url https://ethereum-sepolia-rpc.publicnode.com
const ONCHAIN_VECTOR = "0xcdaf9acb850b8ba4342f79fb484a7fec8e4c55848be838d544cfce5f78abbd48";

describe("commitWindow (mirrors ETHRegistrar commit/_consumeCommitment)", () => {
  const t0 = 1_000n;
  const min = 60n; // hackathon MIN_COMMITMENT_AGE
  const max = 86_400n; // hackathon MAX_COMMITMENT_AGE

  it("no commitment on-chain (t0 = 0)", () => {
    const w = commitWindow(0n, min, max, 5_000_000n);
    expect(w).toMatchObject({ onchain: false, phase: "none", aged: false, unexpired: false });
  });

  it("too new: now < t0 + min (register reverts CommitmentTooNew, commit reverts Unexpired)", () => {
    const w = commitWindow(t0, min, max, t0 + min - 1n);
    expect(w).toMatchObject({ onchain: true, phase: "too-new", aged: false, unexpired: true });
    expect(w.validFrom).toBe(t0 + min);
  });

  it("valid: t0 + min <= now < t0 + max (both bounds)", () => {
    expect(commitWindow(t0, min, max, t0 + min).phase).toBe("valid");
    expect(commitWindow(t0, min, max, t0 + max - 1n)).toMatchObject({
      aged: true,
      unexpired: true,
    });
  });

  it("expired: now >= t0 + max (register reverts CommitmentTooOld, commit allowed)", () => {
    const w = commitWindow(t0, min, max, t0 + max);
    expect(w).toMatchObject({ onchain: true, phase: "expired", aged: false, unexpired: false });
    expect(w.validTo).toBe(t0 + max);
  });
});

describe("makeCommitment", () => {
  it("matches the recorded on-chain vector", () => {
    expect(makeCommitment(vector)).toBe(ONCHAIN_VECTOR);
  });

  it("changes when any field changes", () => {
    const base = makeCommitment(vector);
    expect(makeCommitment({ ...vector, label: "botanicb" })).not.toBe(base);
    expect(makeCommitment({ ...vector, duration: 31536001n })).not.toBe(base);
    expect(makeCommitment({ ...vector, secret: ZERO_BYTES32 })).not.toBe(base);
  });

  it("matches live ETHRegistrar.makeCommitment (network)", async (ctx) => {
    const client = createPublicClient({
      chain: sepolia,
      transport: http(
        process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
        {
          timeout: 8_000,
          retryCount: 0,
        },
      ),
    });
    const random: CommitmentParams = {
      ...vector,
      secret: `0x${Date.now().toString(16).padStart(64, "0")}`,
    };
    let onchain: `0x${string}`;
    try {
      onchain = await client.readContract({
        address: addresses.ETHRegistrar,
        abi: ethRegistrarAbi,
        functionName: "makeCommitment",
        args: [
          random.label,
          random.owner,
          random.secret,
          random.subregistry,
          random.resolver,
          random.duration,
          random.referrer,
        ],
      });
    } catch {
      ctx.skip();
      return;
    }
    expect(makeCommitment(random)).toBe(onchain);
  }, 15_000);
});
