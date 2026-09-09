// Typed loader for packages/ens/deployments.json — hackathon-frozen set only (R2).
// Every ENSv2 address the codebase touches MUST come from here; no literals elsewhere.
// The file is read at runtime (not `import`ed) so the same code works from src/ (tsx)
// and dist/ (tsc) without pulling the JSON under rootDir.
import { readFileSync } from "node:fs";
import { getAddress, isAddress, type Address } from "viem";

/** Ethereum Sepolia — the only chain the hackathon deployment lives on. */
export const SEPOLIA_CHAIN_ID = 11155111 as const;

/** Contracts that must be present in deployments.json for the package to work. */
export const REQUIRED_CONTRACTS = [
  "ETHRegistrar",
  "ETHRegistry",
  "StandardRentPriceOracle",
  "MockUSDC",
  "MockDAI",
  "RootRegistry",
  "UniversalResolverV2",
  "UpgradableUniversalResolverProxy",
  "VerifiableFactory",
  "PermissionedResolverImpl",
  "UserRegistryImpl",
] as const;

export type RequiredContract = (typeof REQUIRED_CONTRACTS)[number];

export interface Deployments {
  network: "sepolia";
  chainId: typeof SEPOLIA_CHAIN_ID;
  deployment: string;
  sourceUrl: string;
  fetchedAt: string;
  /** Checksummed addresses; required keys are guaranteed, extras are passed through. */
  contracts: Record<RequiredContract, Address> & Record<string, Address>;
  endpoints: Record<string, string>;
}

export const DEFAULT_DEPLOYMENTS_PATH = new URL("../deployments.json", import.meta.url);

/**
 * Parse + validate a deployments document. Throws on: wrong chainId, missing
 * required contract, or any malformed address (so a typo fails loudly at import).
 */
export function parseDeployments(raw: unknown): Deployments {
  if (typeof raw !== "object" || raw === null) throw new Error("deployments: not an object");
  const doc = raw as Record<string, unknown>;
  if (doc.chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error(`deployments: chainId ${String(doc.chainId)} != ${SEPOLIA_CHAIN_ID} (R2)`);
  }
  if (doc.network !== "sepolia") throw new Error(`deployments: network ${String(doc.network)}`);
  const contractsRaw = doc.contracts;
  if (typeof contractsRaw !== "object" || contractsRaw === null) {
    throw new Error("deployments: contracts missing");
  }
  const contracts: Record<string, Address> = {};
  for (const [name, value] of Object.entries(contractsRaw as Record<string, unknown>)) {
    if (typeof value !== "string" || !isAddress(value, { strict: false })) {
      throw new Error(`deployments: contract ${name} has invalid address ${String(value)}`);
    }
    contracts[name] = getAddress(value);
  }
  for (const name of REQUIRED_CONTRACTS) {
    if (!contracts[name]) throw new Error(`deployments: required contract ${name} missing`);
  }
  const endpoints =
    typeof doc.endpoints === "object" && doc.endpoints !== null
      ? (doc.endpoints as Record<string, string>)
      : {};
  return {
    network: "sepolia",
    chainId: SEPOLIA_CHAIN_ID,
    deployment: String(doc.deployment ?? ""),
    sourceUrl: String(doc.sourceUrl ?? ""),
    fetchedAt: String(doc.fetchedAt ?? ""),
    contracts: contracts as Deployments["contracts"],
    endpoints,
  };
}

/** Load + validate deployments.json from disk (defaults to the package copy). */
export function loadDeployments(path: URL | string = DEFAULT_DEPLOYMENTS_PATH): Deployments {
  return parseDeployments(JSON.parse(readFileSync(path, "utf8")));
}

/** Eagerly validated singleton — hackathon-frozen set only (R2). */
export const deployments: Deployments = loadDeployments();

/** Shorthand: `addresses.ETHRegistrar` etc. */
export const addresses = deployments.contracts;
