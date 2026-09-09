// VerifiableFactory helpers for M2.1: salt schemes + initialize/deployProxy
// calldata. Addresses come from deployments.ts (hackathon-frozen, R2).
// tokenIds are never part of this module (R3) — parent-name writes use labelhash.
import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  namehash,
  stringToHex,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { permissionedResolverInitAbi } from "./abi/permissionedResolver.js";
import { userRegistryInitAbi } from "./abi/userRegistry.js";
import { verifiableFactoryAbi } from "./abi/verifiableFactory.js";
import { ethRegistryAbi } from "./abi/ethRegistry.js";

/** One assignee in every EAC nybble (role + admin counterpart). ENS docs ALL_ROLES. */
export const ALL_ROLES = 0x1111111111111111111111111111111111111111111111111111111111111111n;

export const SALT_VERSION = 0n;

export const OWNED_RESOLVER_TAG = keccak256(stringToHex("OwnedResolver"));
export const USER_REGISTRY_TAG = keccak256(stringToHex("UserRegistry"));

/** keccak256(utf8(label)) as uint256 — ETHRegistry anyId, not a tokenId (R3). */
export function labelhashOf(label: string): bigint {
  return BigInt(keccak256(toHex(label)));
}

/** `keccak256("OwnedResolver", owner, version)` — one resolver per owner. */
export function resolverSalt(owner: Address, version: bigint = SALT_VERSION): bigint {
  return BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
        [OWNED_RESOLVER_TAG, owner, version],
      ),
    ),
  );
}

/** `keccak256("UserRegistry", namehash, version)` — one subregistry per name. */
export function registrySalt(fullName: string, version: bigint = SALT_VERSION): bigint {
  return BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
        [USER_REGISTRY_TAG, namehash(fullName), version],
      ),
    ),
  );
}

export function encodeRegistryInit(admin: Address): Hex {
  return encodeFunctionData({
    abi: userRegistryInitAbi,
    functionName: "initialize",
    args: [[{ account: admin, roleBitmap: ALL_ROLES }]],
  });
}

export function encodeResolverInit(admin: Address): Hex {
  return encodeFunctionData({
    abi: permissionedResolverInitAbi,
    functionName: "initialize",
    args: [[{ account: admin, roleBitmap: ALL_ROLES }], []],
  });
}

export function encodeDeployProxy(implementation: Address, salt: bigint, data: Hex): Hex {
  return encodeFunctionData({
    abi: verifiableFactoryAbi,
    functionName: "deployProxy",
    args: [implementation, salt, data],
  });
}

/** Point parent name at a subregistry by anyId (pass labelhash, never a cached tokenId). */
export function encodeSetSubregistry(anyId: bigint, registry: Address): Hex {
  return encodeFunctionData({
    abi: ethRegistryAbi,
    functionName: "setSubregistry",
    args: [anyId, registry],
  });
}

export function encodeSetResolver(anyId: bigint, resolver: Address): Hex {
  return encodeFunctionData({
    abi: ethRegistryAbi,
    functionName: "setResolver",
    args: [anyId, resolver],
  });
}

export interface TownDeployRecord {
  chainId: number;
  network: "sepolia";
  label: string;
  name: string;
  contracts: { TownRegistry: Address; TownResolver: Address };
  env: { ENS_TOWN_REGISTRY: Address; ENS_TOWN_RESOLVER: Address };
}

/** Snapshot written on --broadcast only. No tokenId field (R3). */
export function townDeployRecord(opts: {
  chainId: number;
  label: string;
  registry: Address;
  resolver: Address;
}): TownDeployRecord {
  return {
    chainId: opts.chainId,
    network: "sepolia",
    label: opts.label,
    name: `${opts.label}.eth`,
    contracts: { TownRegistry: opts.registry, TownResolver: opts.resolver },
    env: { ENS_TOWN_REGISTRY: opts.registry, ENS_TOWN_RESOLVER: opts.resolver },
  };
}
