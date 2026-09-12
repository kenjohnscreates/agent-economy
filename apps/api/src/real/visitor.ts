// Off-roster visitor: persist, Circle SCA, ENS mint, treasury registerAgent, deposit chat.
// Never added to AGENT_NAMES. Gate: ALLOW_VISITOR=true or ALLOW_BROADCAST=true.
// Mayor POSTs stay on ALLOW_BROADCAST. No revokeName / 12-tick.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  ARC_EXPLORER_URL,
  ARC_USDC_ADDRESS,
  ENS_KEYS,
  MAX_SUBAGENTS,
  MAX_VISITORS,
  VISITOR_AVATAR,
  depositReply,
  ensNameFor,
  formatUsdcHuman,
  parseVisitorIntent,
  percentOf,
  validateVisitorLabel,
  type Address,
  type AgentSummary,
  type VisitorChatRequest,
  type VisitorChatResponse,
  type VisitorCreateRequest,
  type VisitorIntent,
  type VisitorResponse,
} from "@agent-town/shared";
import {
  ARC_TESTNET_BLOCKCHAIN,
  DEFAULT_FEE,
  EXISTING_WALLET_SET_ID,
  TREASURER_NAME,
  executeContract,
  readRoster,
  resolveTreasuryAddress,
  rosterOwnerOfAddress,
  waitComplete,
  type CircleClient,
} from "@agent-town/circle";
import {
  ALL_ROLES,
  COIN_TYPE_ARC,
  COIN_TYPE_ETH,
  RegistrarRole,
  addresses,
  dnsEncodeName,
  dnsEncodeTownName,
  encodeRegistryInit,
  encodeSetAddress,
  encodeSetText,
  ethRegistryAbi,
  labelhashOf,
  loadTown,
  registrySalt,
  townRegistrarAbi,
  townRegistryAbi,
  townResolverAbi,
  verifiableFactoryAbi,
} from "@agent-town/ens";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  zeroAddress,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { SourceError } from "../source.js";
import type { BalanceReader } from "./balances.js";

const MAX_CREATE_ATTEMPTS = 8;
const LLM_TIMEOUT_MS = 8_000;
const READONLY_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const CONSUMER_SECONDS = 30 * 24 * 60 * 60;

const CIRCLE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../packages/circle");
export const DEFAULT_VISITOR_PATH = resolve(CIRCLE_DIR, "visitor.json");
export const DEFAULT_VISITORS_PATH = resolve(CIRCLE_DIR, "visitors.json");

export interface VisitorSubagentArt {
  label: string;
  ensName: string;
  createdAt: string;
}

export interface VisitorArtifact {
  label: string;
  ensName: string;
  walletId: string;
  address: Address;
  createdAt: string;
  subregistry?: Address;
  subagents?: VisitorSubagentArt[];
}

export interface VisitorService {
  getVisitor(label?: string): VisitorResponse | null;
  visitorSummaries(): Promise<AgentSummary[]>;
  createVisitor(body: VisitorCreateRequest): Promise<VisitorResponse>;
  chatVisitor(body: VisitorChatRequest): Promise<VisitorChatResponse>;
}

export interface VisitorDeps {
  circle: CircleClient;
  readBalance: BalanceReader;
  visitorAllowed: boolean;
  townName: string;
  getTownRateBps: () => number;
  env?: NodeJS.ProcessEnv;
  artifactPath?: string;
  now?: () => Date;
}

function requireVisitor(allowed: boolean, what: string): void {
  if (!allowed) {
    throw new SourceError(
      501,
      "NOT_IMPLEMENTED",
      `${what} requires ALLOW_VISITOR=true (or ALLOW_BROADCAST=true)`,
    );
  }
}

function loadMap(path: string): Record<string, VisitorArtifact> {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (raw && typeof raw === "object" && "label" in raw && "walletId" in raw) {
      const one = raw as VisitorArtifact;
      return one.label ? { [one.label]: one } : {};
    }
    if (raw && typeof raw === "object") return raw as Record<string, VisitorArtifact>;
    return {};
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}

function saveMap(map: Record<string, VisitorArtifact>, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(map, null, 2)}\n`, "utf8");
}

function migrateLegacy(path: string, legacyPath: string): Record<string, VisitorArtifact> {
  const map = loadMap(path);
  if (Object.keys(map).length > 0) return map;
  try {
    const one = JSON.parse(readFileSync(legacyPath, "utf8")) as VisitorArtifact;
    if (one?.label && one.walletId && one.address) {
      const next = { [one.label]: one };
      saveMap(next, path);
      return next;
    }
  } catch {
    /* no legacy file */
  }
  return map;
}

function toResponse(art: VisitorArtifact, balanceUsdc: string): VisitorResponse {
  return {
    name: art.label,
    ensName: art.ensName,
    role: "consumer",
    arcAddress: art.address,
    balanceUsdc,
    explorerUrl: `${ARC_EXPLORER_URL}/address/${art.address}`,
    ensUrl: "https://explorer.ens.dev/",
    subagents: (art.subagents ?? []).map((s) => ({ name: s.label, ensName: s.ensName })),
  };
}

function toSummary(art: VisitorArtifact, balanceUsdc: string): AgentSummary {
  return {
    name: art.label,
    ensName: art.ensName,
    role: "consumer",
    arcAddress: art.address,
    balanceUsdc,
    creditScore: null,
    position: { building: "homes", x: 0.2, y: 0.45 },
    lastDecision: null,
    narration: "I just arrived in botanica.",
    avatar: VISITOR_AVATAR,
  };
}

function hexKey(raw: string): Hex {
  const t = raw.trim();
  return (t.startsWith("0x") ? t : `0x${t}`) as Hex;
}

function pickVisitor(
  map: Record<string, VisitorArtifact>,
  label?: string,
): VisitorArtifact | null {
  if (label) return map[label] ?? null;
  const vals = Object.values(map);
  return vals.length === 1 ? (vals[0] ?? null) : null;
}

async function ensureVisitorWallet(
  circle: CircleClient,
  label: string,
  env: NodeJS.ProcessEnv,
): Promise<{ walletId: string; address: Address }> {
  const roster = readRoster();
  const setId = env.CIRCLE_WALLET_SET_ID?.trim() || roster.walletSetId || EXISTING_WALLET_SET_ID;
  const refId = `visitor-${label}`;
  const listed = await circle.listWallets({
    walletSetId: setId,
    refId,
    blockchain: ARC_TESTNET_BLOCKCHAIN,
  });
  const existing = listed.data?.wallets?.find((w) => w.refId === refId);
  if (existing?.id && existing.address) {
    const addr = existing.address as Address;
    const owner = rosterOwnerOfAddress(roster, addr);
    if (owner) {
      throw new SourceError(
        400,
        "BAD_REQUEST",
        `Wallet ${addr} is already roster ${owner.name}; pick another name`,
      );
    }
    return { walletId: existing.id, address: addr };
  }
  for (let i = 0; i < MAX_CREATE_ATTEMPTS; i++) {
    const res = await circle.createWallets({
      walletSetId: setId,
      accountType: "SCA",
      blockchains: [ARC_TESTNET_BLOCKCHAIN],
      count: 1,
      metadata: [{ name: refId, refId }],
    });
    const w = res.data?.wallets?.[0];
    if (!w?.id || !w.address) throw new Error("createWallets returned no visitor wallet");
    const addr = w.address as Address;
    const owner = rosterOwnerOfAddress(roster, addr);
    if (!owner) return { walletId: w.id, address: addr };
  }
  throw new SourceError(
    400,
    "BAD_REQUEST",
    "Could not mint a unique Circle SCA (CREATE2 collision). Try again.",
  );
}

function sepoliaClients(env: NodeJS.ProcessEnv) {
  const key = env.ENS_TREASURER_PRIVATE_KEY?.trim();
  if (!key) throw new SourceError(501, "NOT_IMPLEMENTED", "ENS_TREASURER_PRIVATE_KEY is not set");
  const rpc = env.SEPOLIA_RPC_URL?.trim() || READONLY_RPC;
  const account = privateKeyToAccount(hexKey(key));
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpc) });
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpc) });
  return { account, publicClient, walletClient };
}

async function mintVisitorName(opts: {
  label: string;
  owner: Address;
  townName: string;
  env: NodeJS.ProcessEnv;
}): Promise<void> {
  const { account, publicClient, walletClient } = sepoliaClients(opts.env);
  const town = loadTown();
  const registrar = { address: town.contracts.TownRegistrar, abi: townRegistrarAbi };
  const registry = { address: town.contracts.TownRegistry, abi: townRegistryAbi };
  const resolver = { address: town.contracts.TownResolver, abi: townResolverAbi };
  const anyId = labelhashOf(opts.label);
  const before = await publicClient.readContract({
    ...registry,
    functionName: "getState",
    args: [anyId],
  });
  if (before.status !== 2) {
    const { request } = await publicClient.simulateContract({
      ...registrar,
      functionName: "register",
      args: [opts.label, opts.owner, RegistrarRole.Consumer],
      account,
    });
    const hash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
  }
  const dns = dnsEncodeTownName(opts.label, opts.townName);
  const calls = [
    encodeSetAddress(dns, COIN_TYPE_ARC, opts.owner),
    encodeSetAddress(dns, COIN_TYPE_ETH, opts.owner),
    encodeSetText(dns, ENS_KEYS.avatar, `https://agent-town-eight.vercel.app${VISITOR_AVATAR}`),
  ];
  const { request } = await publicClient.simulateContract({
    ...resolver,
    functionName: "multicall",
    args: [calls],
    account,
  });
  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
}

async function ensureSubregistry(
  parentLabel: string,
  parentEns: string,
  env: NodeJS.ProcessEnv,
): Promise<Address> {
  const { account, publicClient, walletClient } = sepoliaClients(env);
  const town = loadTown();
  const registry = { address: town.contracts.TownRegistry, abi: townRegistryAbi };
  const existing = await publicClient.readContract({
    ...registry,
    functionName: "getSubregistry",
    args: [parentLabel],
  });
  if (existing && existing !== zeroAddress) return existing as Address;

  const factory = { address: addresses.VerifiableFactory, abi: verifiableFactoryAbi };
  const salt = registrySalt(parentEns);
  const init = encodeRegistryInit(account.address);
  const { result, request } = await publicClient.simulateContract({
    ...factory,
    functionName: "deployProxy",
    args: [addresses.UserRegistryImpl, salt, init],
    account,
  });
  const hash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const logs = parseEventLogs({
    abi: verifiableFactoryAbi,
    eventName: "ProxyDeployed",
    logs: receipt.logs,
  });
  const proxy = (logs[0]?.args.proxyAddress ?? result) as Address;
  if (!proxy) throw new Error("deployProxy minted no UserRegistry");

  const pointer = { address: town.contracts.TownRegistry, abi: ethRegistryAbi };
  const { request: setReq } = await publicClient.simulateContract({
    ...pointer,
    functionName: "setSubregistry",
    args: [labelhashOf(parentLabel), proxy],
    account,
  });
  const setHash = await walletClient.writeContract(setReq);
  await publicClient.waitForTransactionReceipt({ hash: setHash });
  return proxy;
}

async function mintSubagent(opts: {
  parent: VisitorArtifact;
  subLabel: string;
  townName: string;
  env: NodeJS.ProcessEnv;
}): Promise<{ ensName: string; subregistry: Address }> {
  const subLabel = validateVisitorLabel(opts.subLabel);
  if (subLabel === opts.parent.label) {
    throw new SourceError(400, "BAD_REQUEST", "Pick a different label than your own name.");
  }
  const existing = opts.parent.subagents?.find((s) => s.label === subLabel);
  if (existing) return { ensName: existing.ensName, subregistry: opts.parent.subregistry ?? zeroAddress };
  if ((opts.parent.subagents?.length ?? 0) >= MAX_SUBAGENTS) {
    throw new SourceError(400, "BAD_REQUEST", "Subagent cap reached.");
  }
  const { account, publicClient, walletClient } = sepoliaClients(opts.env);
  const town = loadTown();
  const subregistry = await ensureSubregistry(opts.parent.label, opts.parent.ensName, opts.env);
  const child = { address: subregistry, abi: townRegistryAbi };
  const anyId = labelhashOf(subLabel);
  const state = await publicClient.readContract({
    ...child,
    functionName: "getState",
    args: [anyId],
  });
  if (state.status !== 2) {
    const expiry = BigInt(Math.floor(Date.now() / 1000) + CONSUMER_SECONDS);
    const { request } = await publicClient.simulateContract({
      ...child,
      functionName: "register",
      args: [subLabel, opts.parent.address, zeroAddress, town.contracts.TownResolver, ALL_ROLES, expiry],
      account,
    });
    const hash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
  }
  const ensName = `${subLabel}.${opts.parent.ensName}`;
  const dns = dnsEncodeName(ensName);
  const resolver = { address: town.contracts.TownResolver, abi: townResolverAbi };
  const calls = [
    encodeSetAddress(dns, COIN_TYPE_ARC, opts.parent.address),
    encodeSetAddress(dns, COIN_TYPE_ETH, opts.parent.address),
    encodeSetText(dns, ENS_KEYS.avatar, `https://agent-town-eight.vercel.app${VISITOR_AVATAR}`),
  ];
  const { request } = await publicClient.simulateContract({
    ...resolver,
    functionName: "multicall",
    args: [calls],
    account,
  });
  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return { ensName, subregistry };
}

async function registerOnTreasury(
  circle: CircleClient,
  ensName: string,
  agent: Address,
): Promise<void> {
  const roster = readRoster();
  const ada = roster.wallets.find((w) => w.name === TREASURER_NAME);
  if (!ada) throw new Error("roster.json missing ada");
  const treasury = resolveTreasuryAddress();
  const { txId } = await executeContract(circle, {
    walletId: ada.walletId,
    contractAddress: treasury,
    abiFunctionSignature: "registerAgent(address,string)",
    abiParameters: [agent, ensName],
    fee: DEFAULT_FEE,
    idempotencyKey: randomUUID(),
  });
  await waitComplete(circle, txId);
}

async function depositUsdc(
  circle: CircleClient,
  walletId: string,
  amountUsdc: string,
): Promise<{ txHash: VisitorChatResponse["txHash"]; explorerUrl: string }> {
  const treasury = resolveTreasuryAddress();
  const approve = await executeContract(circle, {
    walletId,
    contractAddress: ARC_USDC_ADDRESS,
    abiFunctionSignature: "approve(address,uint256)",
    abiParameters: [treasury, amountUsdc],
    fee: DEFAULT_FEE,
    idempotencyKey: randomUUID(),
  });
  await waitComplete(circle, approve.txId);
  const dep = await executeContract(circle, {
    walletId,
    contractAddress: treasury,
    abiFunctionSignature: "deposit(uint256)",
    abiParameters: [amountUsdc],
    fee: DEFAULT_FEE,
    idempotencyKey: randomUUID(),
  });
  const done = await waitComplete(circle, dep.txId);
  if (!done.txHash) throw new Error("deposit COMPLETE without txHash");
  return {
    txHash: done.txHash as VisitorChatResponse["txHash"],
    explorerUrl: `${ARC_EXPLORER_URL}/tx/${done.txHash}`,
  };
}

async function llmIntent(text: string, env: NodeJS.ProcessEnv): Promise<VisitorIntent | null> {
  const anthropic = env.ANTHROPIC_API_KEY?.trim();
  const openai = env.OPENAI_API_KEY?.trim();
  if (!anthropic && !openai) return null;
  const prompt = `You map a visitor agent's chat to one JSON object, nothing else.
Allowed kinds:
{"kind":"balance"}
{"kind":"deposit_percent","bps":5000}
{"kind":"deposit_usdc","amountUsdc":"1000000"}
{"kind":"create_subagent","label":"scout"}
{"kind":"refuse","reason":"I can only check my balance, deposit into the town bank, or mint a subagent."}
bps is 1-10000 (50% = 5000). amountUsdc is a 6-decimal integer string.
Refuse loans, defaults, transfers to people, revokeName.
User: ${text}`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
  try {
    if (anthropic) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: ac.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": anthropic,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 200,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { content?: Array<{ text?: string }> };
      const raw = body.content?.[0]?.text?.trim() ?? "";
      const json = raw.replace(/^```json\s*|\s*```$/g, "");
      const parsed = JSON.parse(json) as VisitorIntent;
      if (parsed.kind === "deposit_percent" && parsed.bps >= 1 && parsed.bps <= 10_000)
        return parsed;
      if (parsed.kind === "deposit_usdc" && /^\d+$/.test(parsed.amountUsdc)) return parsed;
      if (parsed.kind === "create_subagent" && parsed.label) return parsed;
      if (parsed.kind === "balance" || parsed.kind === "refuse") return parsed;
      return null;
    }
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ac.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${openai}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = body.choices?.[0]?.message?.content?.trim() ?? "";
    const json = raw.replace(/^```json\s*|\s*```$/g, "");
    return JSON.parse(json) as VisitorIntent;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function createVisitorService(deps: VisitorDeps): VisitorService {
  const path = deps.artifactPath ?? DEFAULT_VISITORS_PATH;
  const env = deps.env ?? process.env;
  const townName = deps.townName;

  function readMap(): Record<string, VisitorArtifact> {
    return migrateLegacy(path, DEFAULT_VISITOR_PATH);
  }

  async function balanceOf(art: VisitorArtifact): Promise<string> {
    try {
      return await deps.readBalance(art.address);
    } catch {
      return "0";
    }
  }

  return {
    getVisitor(label) {
      const art = pickVisitor(readMap(), label);
      if (!art) return null;
      return toResponse(art, "0");
    },

    async visitorSummaries() {
      const out: AgentSummary[] = [];
      for (const art of Object.values(readMap())) {
        out.push(toSummary(art, await balanceOf(art)));
      }
      return out;
    },

    async createVisitor(body) {
      requireVisitor(deps.visitorAllowed, "Visitor create");
      let label: string;
      try {
        label = validateVisitorLabel(body.label);
      } catch (e) {
        throw new SourceError(400, "BAD_REQUEST", e instanceof Error ? e.message : "Invalid name");
      }
      const map = readMap();
      const existing = map[label];
      if (existing) return toResponse(existing, await balanceOf(existing));
      if (Object.keys(map).length >= MAX_VISITORS) {
        throw new SourceError(400, "BAD_REQUEST", "Visitor cap reached");
      }
      const wallet = await ensureVisitorWallet(deps.circle, label, env);
      const ensName = ensNameFor(label, townName);
      await mintVisitorName({ label, owner: wallet.address, townName, env });
      await registerOnTreasury(deps.circle, ensName, wallet.address);
      const art: VisitorArtifact = {
        label,
        ensName,
        walletId: wallet.walletId,
        address: wallet.address,
        createdAt: (deps.now ?? (() => new Date()))().toISOString(),
        subagents: [],
      };
      map[label] = art;
      saveMap(map, path);
      return toResponse(art, await balanceOf(art));
    },

    async chatVisitor(body) {
      requireVisitor(deps.visitorAllowed, "Visitor chat");
      const map = readMap();
      const art = pickVisitor(map, body.label);
      if (!art) throw new SourceError(404, "NOT_FOUND", "No visitor agent yet");
      let intent = parseVisitorIntent(body.text);
      if (intent.kind === "refuse") {
        const llm = await llmIntent(body.text, env);
        if (llm) intent = llm;
      }
      const bal = await balanceOf(art);
      if (intent.kind === "balance") {
        return {
          reply: `I hold ${formatUsdcHuman(bal)} on Arc.`,
          txHash: null,
          explorerUrl: null,
        };
      }
      if (intent.kind === "create_subagent") {
        const minted = await mintSubagent({
          parent: art,
          subLabel: intent.label,
          townName,
          env,
        });
        const next: VisitorArtifact = {
          ...art,
          subregistry: minted.subregistry,
          subagents: [
            ...(art.subagents ?? []).filter((s) => s.label !== intent.label),
            {
              label: intent.label,
              ensName: minted.ensName,
              createdAt: (deps.now ?? (() => new Date()))().toISOString(),
            },
          ],
        };
        map[art.label] = next;
        saveMap(map, path);
        return {
          reply: `Minted ${minted.ensName} as a subagent of ${art.ensName}. Same Arc wallet.`,
          txHash: null,
          explorerUrl: "https://explorer.ens.dev/",
        };
      }
      if (intent.kind === "refuse") {
        return { reply: intent.reason, txHash: null, explorerUrl: null };
      }
      const amount =
        intent.kind === "deposit_percent" ? percentOf(bal, intent.bps) : intent.amountUsdc;
      if (BigInt(amount) <= 0n) {
        return {
          reply: "Nothing to deposit — send Arc USDC to my wallet first, then refresh. (Same asset pays gas on Arc; Sepolia ETH is not required.)",
          txHash: null,
          explorerUrl: null,
        };
      }
      if (BigInt(amount) > BigInt(bal)) {
        return { reply: `I only have ${formatUsdcHuman(bal)}.`, txHash: null, explorerUrl: null };
      }
      const tx = await depositUsdc(deps.circle, art.walletId, amount);
      return {
        reply: depositReply(amount, deps.getTownRateBps()),
        txHash: tx.txHash,
        explorerUrl: tx.explorerUrl,
      };
    },
  };
}

export function visitorFileExists(path: string = DEFAULT_VISITORS_PATH): boolean {
  return existsSync(path) || existsSync(DEFAULT_VISITOR_PATH);
}
