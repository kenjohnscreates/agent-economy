// Minimal ABI for the live town UserRegistry proxy (hackathon inode).
// Parent writes use labelhash anyId; never persist tokenIds (R3).
// `unregister(uint256)` selector 0xa02b161e verified 2026-09-09 against UserRegistryImpl
// bytecode at deployments.json 0x47b442d0cf617c41cabaff5f02f44dd1e5f72546.
import { parseAbi, toFunctionSelector } from "viem";

export const townRegistryAbi = parseAbi([
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256 tokenId)",
  "function getState(uint256 anyId) view returns ((uint8 status, uint64 expiry, address latestOwner, uint256 tokenId, uint256 resource) state)",
  "function getOwner(uint256 anyId) view returns (address)",
  "function getResolver(string label) view returns (address)",
  "function getSubregistry(string label) view returns (address)",
  "function grantRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function hasRoles(uint256 anyId, uint256 roleBitmap, address account) view returns (bool)",
  "function unregister(uint256 anyId)", // 0xa02b161e
  "error EACUnauthorizedAccountRoles(uint256 resource, uint256 roleBitmap, address account)",
  "error LabelAlreadyRegistered(string label)",
]);

/** `unregister(uint256)` — UserRegistryImpl 0x47b4…2546. */
export const UNREGISTER_SELECTOR = toFunctionSelector("function unregister(uint256 anyId)");
