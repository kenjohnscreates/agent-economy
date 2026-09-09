// Minimal ABI for ENSv2 `ETHRegistrar` (commit-reveal .eth registrar).
// Source: github.com/ensdomains/namechain contracts/src/registrar/ETHRegistrar.sol
//         + AbstractETHRegistrar.sol + interfaces/IETHRegistrar.sol
// Pinned commit: 48b3e2d39513b9dd32ef1850877a29009bc807b9 (2026-09-08)
// Verified: every selector below is present in `cast code` of the hackathon
// ETHRegistrar (0x7d1b…270b) — see packages/ens/README.md. The hackathon page
// ships no ABIs, so this is hand-pinned; do not extend without re-verifying.
import { parseAbi } from "viem";

export const ethRegistrarAbi = parseAbi([
  // --- reads ---
  "function isAvailable(string label) view returns (bool)", // 0x965306aa
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)", // 0x61907b12
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)", // 0x1e966f07
  "function commitmentAt(bytes32 commitment) view returns (uint64)", // 0x16a92535
  "function MIN_COMMITMENT_AGE() view returns (uint64)", // 0x2e4f692a
  "function MAX_COMMITMENT_AGE() view returns (uint64)", // 0x8ccb9ea6
  "function MIN_REGISTER_DURATION() view returns (uint64)", // 0xa40938bd
  "function GRACE_PERIOD() view returns (uint64)", // 0xc1a287e2
  "function ETH_REGISTRY() view returns (address)", // 0x47500708
  "function BENEFICIARY() view returns (address)", // 0x2f99c6cc
  "function rentPriceOracle() view returns (address)", // 0x7b39ba16
  // --- writes ---
  "function commit(bytes32 commitment)", // 0xf14fcbc8
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256 tokenId)", // 0xcff3e7c2
  // --- events ---
  "event CommitmentMade(bytes32 commitment)",
  "event NameRegistered(uint256 indexed tokenId, string label, address owner, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 indexed referrer, uint256 base, uint256 premium)",
  // --- errors (decoded in dry-run output) ---
  "error UnexpiredCommitmentExists(bytes32 commitment)",
  "error CommitmentTooNew(bytes32 commitment, uint64 validFrom, uint64 blockTimestamp)",
  "error CommitmentTooOld(bytes32 commitment, uint64 validTo, uint64 blockTimestamp)",
  "error NameNotAvailable(string label)",
  "error DurationTooShort(uint64 duration, uint64 minDuration)",
  "error InvalidOwner()",
  "error NotValid(string label)",
  "error PaymentTokenNotSupported(address paymentToken)",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error SafeERC20FailedOperation(address token)",
]);
