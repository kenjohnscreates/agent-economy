// Minimal ABI for the ENSv2 `.eth` registry (a `PermissionedRegistry`).
// Source: github.com/ensdomains/namechain contracts/src/registry/PermissionedRegistry.sol
//         + interfaces/IRegistry.sol + interfaces/IPermissionedRegistry.sol
// Pinned commit: 48b3e2d39513b9dd32ef1850877a29009bc807b9 (2026-09-08)
// Verified against `cast code` of hackathon ETHRegistry (0x1d78…971e).
// NOTE (R3): tokenIds are versioned (low 32 bits) and change on re-register /
// transfer — always re-read via getState(labelhash); never persist them.
import { parseAbi } from "viem";

export const ethRegistryAbi = parseAbi([
  "function getSubregistry(string label) view returns (address)", // 0x35af6216
  "function getResolver(string label) view returns (address)", // 0xe4ae7d77
  // anyId = labelhash | tokenId | resource. Status: 0 AVAILABLE, 1 RESERVED, 2 REGISTERED.
  "function getState(uint256 anyId) view returns ((uint8 status, uint64 expiry, address latestOwner, uint256 tokenId, uint256 resource) state)", // 0x44c9af28
  "function getOwner(uint256 anyId) view returns (address)", // 0xc41a360a
  "function ownerOf(uint256 tokenId) view returns (address)", // 0x6352211e
  "function getExpiry(uint256 anyId) view returns (uint64)", // 0x13c72608
  // writes — anyId = labelhash | tokenId | resource. Prefer labelhash (R3).
  "function setSubregistry(uint256 anyId, address registry)", // 0x341ec559
  "function setResolver(uint256 anyId, address resolver)", // 0xbc7b6d62
  "error EACUnauthorizedAccountRoles(uint256 resource, uint256 roleBitmap, address account)",
  "error InvalidInitialization()",
]);

export const RegistryStatus = { AVAILABLE: 0, RESERVED: 1, REGISTERED: 2 } as const;
