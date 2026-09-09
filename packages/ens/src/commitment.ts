// Local mirror of ETHRegistrar.makeCommitment():
//   keccak256(abi.encode(label, owner, secret, subregistry, resolver, duration, referrer))
// Lets --dry-run print the commitment without an RPC round-trip; the unit test
// cross-checks it against the on-chain pure function.
import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

export interface CommitmentParams {
  label: string;
  owner: Address;
  secret: Hex; // bytes32
  subregistry: Address;
  resolver: Address;
  duration: bigint; // seconds, uint64
  referrer: Hex; // bytes32
}

export const ZERO_BYTES32 = `0x${"0".repeat(64)}` as const;

export type CommitPhase = "none" | "too-new" | "valid" | "expired";

export interface CommitWindow {
  /** commitmentAt(hash) > 0 */
  onchain: boolean;
  validFrom: bigint; // t0 + minAge (inclusive)
  validTo: bigint; // t0 + maxAge (exclusive)
  phase: CommitPhase;
  /** register() would pass _consumeCommitment right now */
  aged: boolean;
  /** commit() would revert UnexpiredCommitmentExists right now */
  unexpired: boolean;
}

/**
 * Mirror of ETHRegistrar._consumeCommitment / commit() window checks:
 *   too-new: now <  t0 + minAge      valid: t0+minAge <= now < t0+maxAge      expired: now >= t0 + maxAge
 * `t0 == 0` means no commitment (treated as expired by the contract; we report "none").
 */
export function commitWindow(
  t0: bigint,
  minAge: bigint,
  maxAge: bigint,
  now: bigint,
): CommitWindow {
  const validFrom = t0 + minAge;
  const validTo = t0 + maxAge;
  const onchain = t0 > 0n;
  let phase: CommitPhase = "none";
  if (onchain) phase = now < validFrom ? "too-new" : now < validTo ? "valid" : "expired";
  return {
    onchain,
    validFrom,
    validTo,
    phase,
    aged: phase === "valid",
    unexpired: phase === "too-new" || phase === "valid",
  };
}

export function makeCommitment(p: CommitmentParams): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "address" },
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "uint64" },
        { type: "bytes32" },
      ],
      [p.label, p.owner, p.secret, p.subregistry, p.resolver, p.duration, p.referrer],
    ),
  );
}
