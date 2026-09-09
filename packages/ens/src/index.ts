// @agent-town/ens — ENSv2 client (resolve, setRecords, role checks) on Sepolia.
// Addresses: deployments.ts (hackathon-frozen set only, R2). ABIs: src/abi/*.
// Registration script: scripts/register-town.ts (M0.4). Resolver client lands M0.3+.
export const PACKAGE = "@agent-town/ens" as const;

export {
  SEPOLIA_CHAIN_ID,
  REQUIRED_CONTRACTS,
  DEFAULT_DEPLOYMENTS_PATH,
  parseDeployments,
  loadDeployments,
  deployments,
  addresses,
  type Deployments,
  type RequiredContract,
} from "./deployments.js";
export {
  ethRegistrarAbi,
  ethRegistryAbi,
  RegistryStatus,
  rentPriceOracleAbi,
  mockUsdcAbi,
} from "./abi/index.js";
export {
  commitWindow,
  makeCommitment,
  ZERO_BYTES32,
  type CommitmentParams,
  type CommitPhase,
  type CommitWindow,
} from "./commitment.js";
