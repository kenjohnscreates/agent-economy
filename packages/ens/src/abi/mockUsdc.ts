// Minimal ABI for the hackathon `MockUSDC` (OZ ERC20Permit + open `mint`).
// Source: github.com/ensdomains/namechain contracts/test/mocks/MockERC20.sol
// Pinned commit: 48b3e2d39513b9dd32ef1850877a29009bc807b9 (2026-09-08)
// Verified against `cast code` of hackathon MockUSDC (0xcbfd…6f05): mint(address,uint256)
// 0x40c10f19 is present and unpermissioned (anyone can mint test USDC).
import { parseAbi } from "viem";

export const mockUsdcAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)", // 0x70a08231
  "function allowance(address owner, address spender) view returns (uint256)", // 0xdd62ed3e
  "function decimals() view returns (uint8)", // 0x313ce567
  "function symbol() view returns (string)", // 0x95d89b41
  "function approve(address spender, uint256 amount) returns (bool)", // 0x095ea7b3
  "function mint(address to, uint256 amount)", // 0x40c10f19
]);
