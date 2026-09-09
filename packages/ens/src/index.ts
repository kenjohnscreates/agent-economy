// @agent-town/ens — ENSv2 client (resolve, setRecords, role checks) on Sepolia.
// Addresses: deployments.ts (hackathon-frozen set only, R2). ABIs: src/abi/*.
// Scripts: register-town.ts (M0.4), deploy-town-subregistry.ts (M2.1, no broadcast by default).
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
  verifiableFactoryAbi,
  userRegistryInitAbi,
  permissionedResolverInitAbi,
} from "./abi/index.js";
export {
  ALL_ROLES,
  SALT_VERSION,
  encodeDeployProxy,
  encodeRegistryInit,
  encodeResolverInit,
  encodeSetResolver,
  encodeSetSubregistry,
  labelhashOf,
  registrySalt,
  resolverSalt,
  townDeployRecord,
  type TownDeployRecord,
} from "./factory.js";
export {
  commitWindow,
  makeCommitment,
  ZERO_BYTES32,
  type CommitmentParams,
  type CommitPhase,
  type CommitWindow,
} from "./commitment.js";
