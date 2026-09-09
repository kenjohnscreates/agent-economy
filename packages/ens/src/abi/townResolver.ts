// Hackathon PermissionedResolver (permres-inode): setters take DNS names, not namehash.
// Address write is `setAddress(bytes,uint256,bytes)` — not namechain `setAddr`.
import { parseAbi } from "viem";

export const townResolverAbi = parseAbi([
  "function setText(bytes name, string key, string value)",
  "function setAddress(bytes name, uint256 coinType, bytes addressBytes)",
  "function grantRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function grantSetterRoles(bytes setter, address account)",
  "function hasRoles(uint256 resource, uint256 roleBitmap, address account) view returns (bool)",
  "function multicall(bytes[] calls) returns (bytes[])",
  "error EACUnauthorizedAccountRoles(uint256 resource, uint256 roleBitmap, address account)",
  "error InvalidEVMAddress(bytes addressBytes)",
]);
