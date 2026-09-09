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
