// UniversalResolverV2 / UpgradableUniversalResolverProxy (hackathon). Clients must
// use the proxy `0xd26f…f142` (deployments.json), not the main Sepolia beta (R2).
import { parseAbi } from "viem";

export const universalResolverAbi = parseAbi([
  "function resolve(bytes name, bytes data) view returns (bytes, address)",
  "function findResolver(bytes name) view returns (address resolver, bytes32 node, uint256 offset)",
  "error ResolverNotFound(bytes name)",
  "error ResolverNotContract(bytes name, address resolver)",
  "error UnsupportedResolverProfile(bytes4 selector)",
  "error ResolverError(bytes errorData)",
]);

/** ENSIP-9/10 profile calldata dispatched through `resolve`. Node is ignored by the inode resolver. */
export const resolverProfileAbi = parseAbi([
  "function addr(bytes32 node) view returns (address)",
  "function addr(bytes32 node, uint256 coinType) view returns (bytes)",
  "function text(bytes32 node, string key) view returns (string)",
  "function multicall(bytes[] data) returns (bytes[])",
]);
