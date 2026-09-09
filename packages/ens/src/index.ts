// @agent-town/ens — ENSv2 client (resolve, setRecords, role checks) on Sepolia.
// Addresses: deployments.ts (hackathon-frozen set only, R2). ABIs: src/abi/*.
// Scripts: register-town.ts (M0.4), deploy-town-subregistry.ts (M2.1), mint-agent-names.ts (M2.3).
// Client: resolveAgent / setCreditScore / appendReview / revokeName (M2.5). Never cache tokenIds (R3).
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
  townRegistryAbi,
  UNREGISTER_SELECTOR,
  townResolverAbi,
  townRegistrarAbi,
  universalResolverAbi,
  resolverProfileAbi,
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
export {
  COIN_TYPE_ARC,
  COIN_TYPE_ETH,
  DEFAULT_APP_ORIGIN,
  RegistrarRole,
  REGISTRY_REGISTRAR_ROLES,
  RESOLVER_REGISTRAR_ROLES,
  agentContextMarkdown,
  avatarUrl,
  buildMintPlan,
  dnsEncodeName,
  dnsEncodeTownName,
  encodeRegister,
  encodeSetAddress,
  encodeSetText,
  registrarRoleOf,
  rosterRoleOf,
  type AgentMintPlan,
  type MintPlan,
  type RegistrarRoleId,
} from "./records.js";
export {
  REQUIRED_TOWN_CONTRACTS,
  DEFAULT_TOWN_PATH,
  parseTown,
  loadTown,
  town,
  townAddresses,
  type TownFile,
  type RequiredTownContract,
} from "./town.js";
export { decodeUrBytes, decodeUrAddress, decodeUrString } from "./decode.js";
export {
  normalizeAgentName,
  resolveAgent,
  setCreditScore,
  appendReview,
  revokeName,
  createEnsClient,
  type EnsPublicClient,
  type EnsWalletClient,
  type EnsClientConfig,
  type EnsClient,
  type ResolvedAgent,
  type WriteResult,
  type NormalizedName,
} from "./client.js";
