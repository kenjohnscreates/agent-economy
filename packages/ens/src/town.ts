// Typed loader for packages/ens/town.json — live botanica subregistry / resolver /
// registrar on Sepolia. Addresses only (R3: no tokenIds). Read at runtime so src/
// and dist/ both work without JSON under rootDir.
import { readFileSync } from "node:fs";
import { getAddress, isAddress, type Address } from "viem";

export const REQUIRED_TOWN_CONTRACTS = ["TownRegistry", "TownResolver", "TownRegistrar"] as const;
export type RequiredTownContract = (typeof REQUIRED_TOWN_CONTRACTS)[number];

export interface TownFile {
  chainId: 11155111;
  network: "sepolia";
  label: string;
  name: string;
  contracts: Record<RequiredTownContract, Address>;
  env: Record<string, string>;
}

export const DEFAULT_TOWN_PATH = new URL("../town.json", import.meta.url);

export function parseTown(raw: unknown): TownFile {
  if (typeof raw !== "object" || raw === null) throw new Error("town.json: not an object");
  const doc = raw as Record<string, unknown>;
  if (doc.chainId !== 11155111)
    throw new Error(`town.json: chainId ${String(doc.chainId)} != 11155111`);
  if (typeof doc.label !== "string" || !doc.label) throw new Error("town.json: label missing");
  const contractsRaw = doc.contracts;
  if (typeof contractsRaw !== "object" || contractsRaw === null) {
    throw new Error("town.json: contracts missing");
  }
  const contracts = {} as Record<RequiredTownContract, Address>;
  for (const name of REQUIRED_TOWN_CONTRACTS) {
    const value = (contractsRaw as Record<string, unknown>)[name];
    if (typeof value !== "string" || !isAddress(value, { strict: false })) {
      throw new Error(`town.json: ${name} missing or invalid`);
    }
    contracts[name] = getAddress(value);
  }
  const env =
    typeof doc.env === "object" && doc.env !== null ? (doc.env as Record<string, string>) : {};
  return {
    chainId: 11155111,
    network: "sepolia",
    label: doc.label.toLowerCase().replace(/\.eth$/i, ""),
    name: typeof doc.name === "string" ? doc.name : `${doc.label}.eth`,
    contracts,
    env,
  };
}

export function loadTown(path: URL | string = DEFAULT_TOWN_PATH): TownFile {
  return parseTown(JSON.parse(readFileSync(path, "utf8")));
}

export const town: TownFile = loadTown();
export const townAddresses = town.contracts;
