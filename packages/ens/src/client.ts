// M2.5 typed ENSv2 client: resolveAgent + treasurer writes (credit-score, reviews, revoke).
// Inputs: agent name (`ada` or `ada.botanica.eth`), viem clients, town.json + deployments.json.
// Outputs: ResolvedAgent; writes simulate by default (ALLOW_BROADCAST to send). Never caches tokenIds (R3).
import {
  ENS_KEYS,
  EnsReviewSchema,
  EnsReviewsSchema,
  RoleSchema,
  type EnsReview,
  type Role,
} from "@agent-town/shared";
import {
  createPublicClient,
  getAddress,
  http,
  namehash,
  type Account,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { sepolia } from "viem/chains";
import { RegistryStatus } from "./abi/ethRegistry.js";
import { townRegistryAbi } from "./abi/townRegistry.js";
import { townResolverAbi } from "./abi/townResolver.js";
import { universalResolverAbi } from "./abi/universalResolver.js";
import { addresses } from "./deployments.js";
import { decodeUrAddress, decodeUrString } from "./decode.js";
import { labelhashOf } from "./factory.js";
import {
  COIN_TYPE_ARC,
  COIN_TYPE_ETH,
  dnsEncodeName,
  encodeResolveAddr,
  encodeResolveText,
} from "./records.js";
import { town, townAddresses } from "./town.js";

export type EnsPublicClient = Pick<PublicClient, "readContract" | "simulateContract">;
export type EnsWalletClient = Pick<WalletClient, "writeContract" | "account">;

export interface EnsClientConfig {
  publicClient?: EnsPublicClient;
  walletClient?: EnsWalletClient;
  registry?: Address;
  resolver?: Address;
  universalResolver?: Address;
  townLabel?: string;
  account?: Account | Address;
  /** Send txs only when true AND `ALLOW_BROADCAST=true`. Default: simulate. */
  broadcast?: boolean;
}

export interface ResolvedAgent {
  ensName: string;
  /** Arc coinType 2152525650. */
  wallet: Address;
  wallet60: Address;
  role: Role;
  avatar: string;
  agentContext: string;
  creditScore?: number;
  reviews?: EnsReview[];
}

export interface WriteResult {
  simulated: boolean;
  hash?: Hash;
}

export interface EnsClient {
  resolveAgent(name: string): Promise<ResolvedAgent>;
  setCreditScore(name: string, score: number, opts?: EnsClientConfig): Promise<WriteResult>;
  appendReview(name: string, review: EnsReview, opts?: EnsClientConfig): Promise<WriteResult>;
  revokeName(name: string, opts?: EnsClientConfig): Promise<WriteResult>;
}

export interface NormalizedName {
  label: string;
  ensName: string;
  dnsName: Hex;
  node: Hex;
}

export function normalizeAgentName(name: string, townLabel: string = town.label): NormalizedName {
  const raw = name.trim().toLowerCase();
  const townName = townLabel
    .trim()
    .toLowerCase()
    .replace(/\.eth$/i, "");
  if (!raw) throw new Error("agent name is empty");
  const suffix = `.${townName}.eth`;
  let label: string;
  let ensName: string;
  if (!raw.includes(".")) {
    label = raw;
    ensName = `${label}${suffix}`;
  } else if (raw.endsWith(suffix)) {
    label = raw.slice(0, -suffix.length);
    ensName = raw;
  } else {
    throw new Error(`expected {label} or {label}.${townName}.eth, got ${name}`);
  }
  if (!label || label.includes(".")) throw new Error(`invalid agent label: ${name}`);
  return { label, ensName, dnsName: dnsEncodeName(ensName), node: namehash(ensName) };
}

function requirePublic(config: EnsClientConfig): EnsPublicClient {
  if (config.publicClient) return config.publicClient;
  const url = process.env.SEPOLIA_RPC_URL?.trim();
  if (!url) throw new Error("SEPOLIA_RPC_URL is required (or pass publicClient)");
  return createPublicClient({ chain: sepolia, transport: http(url) });
}

function addrs(config: EnsClientConfig) {
  return {
    registry: getAddress(config.registry ?? townAddresses.TownRegistry),
    resolver: getAddress(config.resolver ?? townAddresses.TownResolver),
    universal: getAddress(config.universalResolver ?? addresses.UpgradableUniversalResolverProxy),
    townLabel: (config.townLabel ?? town.label).toLowerCase().replace(/\.eth$/i, ""),
  };
}

function allowBroadcast(flag?: boolean): boolean {
  return flag === true && process.env.ALLOW_BROADCAST === "true";
}

async function urResolve(
  client: EnsPublicClient,
  universal: Address,
  dns: Hex,
  data: Hex,
): Promise<Hex> {
  const [result] = await client.readContract({
    address: universal,
    abi: universalResolverAbi,
    functionName: "resolve",
    args: [dns, data],
  });
  return result;
}

/** Re-read live registry state by labelhash. Caller must use tokenId immediately (R3). */
async function readLiveState(client: EnsPublicClient, registry: Address, label: string) {
  const state = await client.readContract({
    address: registry,
    abi: townRegistryAbi,
    functionName: "getState",
    args: [labelhashOf(label)],
  });
  if (state.status !== RegistryStatus.REGISTERED) {
    throw new Error(`${label} is not REGISTERED (status ${state.status})`);
  }
  return state;
}

async function execWrite(
  config: EnsClientConfig,
  params: {
    address: Address;
    abi: typeof townResolverAbi | typeof townRegistryAbi;
    functionName: "setText" | "unregister";
    args: readonly unknown[];
  },
): Promise<WriteResult> {
  const publicClient = requirePublic(config);
  const account = config.account ?? config.walletClient?.account;
  if (!account) throw new Error("account (or walletClient.account) required for ENS writes");
  const { request } = await publicClient.simulateContract({
    address: params.address,
    abi: params.abi,
    functionName: params.functionName,
    args: params.args,
    account,
  } as Parameters<EnsPublicClient["simulateContract"]>[0]);
  if (!allowBroadcast(config.broadcast)) return { simulated: true };
  if (!config.walletClient) throw new Error("walletClient required to broadcast");
  const hash = await config.walletClient.writeContract(
    request as Parameters<EnsWalletClient["writeContract"]>[0],
  );
  return { simulated: false, hash };
}

function parseCreditScore(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    throw new Error(`invalid town.credit-score: ${raw}`);
  }
  return n;
}

function parseReviews(raw: string): EnsReview[] | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  return EnsReviewsSchema.parse(JSON.parse(t) as unknown);
}

export async function resolveAgent(
  name: string,
  config: EnsClientConfig = {},
): Promise<ResolvedAgent> {
  const { universal, townLabel } = addrs(config);
  const n = normalizeAgentName(name, townLabel);
  const client = requirePublic(config);
  const [arcRaw, ethRaw, roleRaw, avatarRaw, ctxRaw, scoreRaw, reviewsRaw] = await Promise.all([
    urResolve(client, universal, n.dnsName, encodeResolveAddr(n.node, COIN_TYPE_ARC)),
    urResolve(client, universal, n.dnsName, encodeResolveAddr(n.node, COIN_TYPE_ETH)),
    urResolve(client, universal, n.dnsName, encodeResolveText(n.node, ENS_KEYS.role)),
    urResolve(client, universal, n.dnsName, encodeResolveText(n.node, ENS_KEYS.avatar)),
    urResolve(client, universal, n.dnsName, encodeResolveText(n.node, ENS_KEYS.agentContext)),
    urResolve(client, universal, n.dnsName, encodeResolveText(n.node, ENS_KEYS.creditScore)),
    urResolve(client, universal, n.dnsName, encodeResolveText(n.node, ENS_KEYS.reviews)),
  ]);
  const wallet = decodeUrAddress(arcRaw);
  const wallet60 = decodeUrAddress(ethRaw);
  if (!wallet) throw new Error(`${n.ensName}: no Arc addr (coinType ${COIN_TYPE_ARC})`);
  if (!wallet60) throw new Error(`${n.ensName}: no addr(60)`);
  const role = RoleSchema.parse(decodeUrString(roleRaw));
  const creditScore = parseCreditScore(decodeUrString(scoreRaw));
  const reviews = parseReviews(decodeUrString(reviewsRaw));
  return {
    ensName: n.ensName,
    wallet,
    wallet60,
    role,
    avatar: decodeUrString(avatarRaw),
    agentContext: decodeUrString(ctxRaw),
    ...(creditScore !== undefined ? { creditScore } : {}),
    ...(reviews !== undefined ? { reviews } : {}),
  };
}

export async function setCreditScore(
  name: string,
  score: number,
  config: EnsClientConfig = {},
): Promise<WriteResult> {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error("credit score must be an integer 0–100");
  }
  const { registry, resolver, townLabel } = addrs(config);
  const n = normalizeAgentName(name, townLabel);
  const publicClient = requirePublic(config);
  await readLiveState(publicClient, registry, n.label);
  return execWrite(config, {
    address: resolver,
    abi: townResolverAbi,
    functionName: "setText",
    args: [n.dnsName, ENS_KEYS.creditScore, String(score)],
  });
}

export async function appendReview(
  name: string,
  review: EnsReview,
  config: EnsClientConfig = {},
): Promise<WriteResult> {
  const parsed = EnsReviewSchema.parse(review);
  const { registry, resolver, universal, townLabel } = addrs(config);
  const n = normalizeAgentName(name, townLabel);
  const publicClient = requirePublic(config);
  await readLiveState(publicClient, registry, n.label);
  const raw = await urResolve(
    publicClient,
    universal,
    n.dnsName,
    encodeResolveText(n.node, ENS_KEYS.reviews),
  );
  const current = parseReviews(decodeUrString(raw)) ?? [];
  const next = EnsReviewsSchema.parse([...current, parsed]);
  return execWrite(config, {
    address: resolver,
    abi: townResolverAbi,
    functionName: "setText",
    args: [n.dnsName, ENS_KEYS.reviews, JSON.stringify(next)],
  });
}

export async function revokeName(name: string, config: EnsClientConfig = {}): Promise<WriteResult> {
  const { registry, townLabel } = addrs(config);
  const n = normalizeAgentName(name, townLabel);
  const publicClient = requirePublic(config);
  const state = await readLiveState(publicClient, registry, n.label);
  // Live tokenId from getState — used in this call only, never stored (R3).
  return execWrite(config, {
    address: registry,
    abi: townRegistryAbi,
    functionName: "unregister",
    args: [state.tokenId],
  });
}

export function createEnsClient(config: EnsClientConfig = {}): EnsClient {
  return {
    resolveAgent: (name) => resolveAgent(name, config),
    setCreditScore: (name, score, opts) => setCreditScore(name, score, { ...config, ...opts }),
    appendReview: (name, review, opts) => appendReview(name, review, { ...config, ...opts }),
    revokeName: (name, opts) => revokeName(name, { ...config, ...opts }),
  };
}
