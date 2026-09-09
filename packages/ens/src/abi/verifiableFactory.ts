// Minimal ABI for ENSv2 `VerifiableFactory` (CREATE2 UUPS/clone proxies).
// Source: github.com/ensdomains/verifiable-factory (IVerifiableFactory.sol).
// Selectors verified against `cast code` of hackathon VerifiableFactory
// (0x894b…7780): deployProxy 0x5d84121a, verifyContract(address) 0x3d200b45,
// proxyLogic 0x813845bc. Two-arg verifyContract is NOT on this deployment.
import { parseAbi } from "viem";

export const verifiableFactoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)", // 0x5d84121a
  "function verifyContract(address proxy) view returns (address implementation)", // 0x3d200b45
  "function proxyLogic() view returns (address)", // 0x813845bc
  "event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)",
  "error VerificationFailed(address proxy)",
]);
