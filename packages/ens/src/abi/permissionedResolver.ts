// Minimal ABI for ENSv2 `PermissionedResolver` proxy initialisation.
// Hackathon PermissionedResolverImpl (0xa9d3…614e) matches the permres-inode
// docs: `initialize((address,uint256)[],bytes[])` 0x33cc44a0. namechain@48b3e2d
// `initialize(address,uint256,bytes[])` 0x7058b559 is absent from bytecode.
// Confirmed via eth_call reverting InvalidInitialization() (0xf92ee8a9).
import { parseAbi } from "viem";

export const permissionedResolverInitAbi = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)", // 0x33cc44a0
]);
