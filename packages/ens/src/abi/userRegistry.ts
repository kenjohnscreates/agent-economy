// Minimal ABI for ENSv2 `UserRegistry` proxy initialisation.
// Hackathon UserRegistryImpl (0x47b4…2546) does NOT match namechain@48b3e2d
// `initialize(address,uint256)` (0xcd6dc687 is absent). Live selector is
// `initialize((address,uint256)[])` 0x37cb53a8 — confirmed via eth_call
// reverting InvalidInitialization() (0xf92ee8a9) on the implementation.
import { parseAbi } from "viem";

export const userRegistryInitAbi = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants)", // 0x37cb53a8
]);
