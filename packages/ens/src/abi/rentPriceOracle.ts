// Minimal ABI for ENSv2 `StandardRentPriceOracle`.
// Source: github.com/ensdomains/namechain contracts/src/registrar/StandardRentPriceOracle.sol
// Pinned commit: 48b3e2d39513b9dd32ef1850877a29009bc807b9 (2026-09-08)
// Verified against `cast code` of hackathon oracle (0xfeba…e71b).
// Prices are "standard units" (1e12 = $1) converted per payment token via
// numer/denom; the hackathon oracle accepts MockUSDC (1/1e6 → 6 dp) and MockDAI.
import { parseAbi } from "viem";

export const rentPriceOracleAbi = parseAbi([
  "function isPaymentToken(address paymentToken) view returns (bool)", // 0x930eaddc
  "function getPaymentTokenRatio(address paymentToken) view returns (uint128 numer, uint128 denom)", // 0x30897dba
  "function getBaseRates() view returns (uint256[])", // 0xc50f093b
  "function isValid(string label) view returns (bool)", // 0xf1dfaefb
  "function getRegisterPrice(string label, uint64 available, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)", // 0xe1de9c83
]);
