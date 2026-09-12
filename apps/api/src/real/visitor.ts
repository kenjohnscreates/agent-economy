// Off-roster visitor: persist, Circle SCA, ENS mint, treasury registerAgent, deposit chat.
// Never added to AGENT_NAMES. Gate A: ALLOW_BROADCAST=true. No revokeName / 12-tick.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  ARC_EXPLORER_URL,
  ARC_USDC_ADDRESS,
  ENS_KEYS,
  VISITOR_AVATAR,
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
  COIN_TYPE_ARC,
  COIN_TYPE_ETH,
  RegistrarRole,
  dnsEncodeTownName,
  encodeSetAddress,
  encodeSetText,
  labelhashOf,
  loadTown,
  townRegistrarAbi,
  townRegistryAbi,
  townResolverAbi,
} from "@agent-town/ens";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { SourceError } from "../source.js";
import type { BalanceReader } from "./balances.js";

const MAX_CREATE_ATTEMPTS = 8;
const LLM_TIMEOUT_MS = 8_000;
const READONLY_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

export const DEFAULT_VISITOR_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../packages/circle/visitor.json",
);

export interface VisitorArtifact {
  label: string;
  ensName: string;
  walletId: string;
  address: Address;
  createdAt: string;
}

export interface VisitorService {
  getVisitor(): VisitorResponse | null;
  visitorSummary(): Promise<AgentSummary | null>;
  createVisitor(body: VisitorCreateRequest): Promise<VisitorResponse>;
  chatVisitor(body: VisitorChatRequest): Promise<VisitorChatResponse>;
}

export interface VisitorDeps {
  circle: CircleClient;
  readBalance: BalanceReader;
  broadcastAllowed: boolean;
  townName: string;
  env?: NodeJS.ProcessEnv;
  artifactPath?: string;
  now?: () => Date;
}

function requireBroadcast(allowed: boolean, what: string): void {
  if (!allowed) {
    throw new SourceError(501, "NOT_IMPLEMENTED", `${what} requires ALLOW_BROADCAST=true`);
  }
}

export function readVisitorArtifact(path: string = DEFAULT_VISITOR_PATH): VisitorArtifact | null {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as VisitorArtifact;
    if (!raw?.label || !raw.walletId || !raw.address) return null;
    return raw;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export function writeVisitorArtifact(
  art: VisitorArtifact,
  path: string = DEFAULT_VISITOR_PATH,
): void {
  writeFileSync(path, `${JSON.stringify(art, null, 2)}\n`, "utf8");
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

async function mintVisitorName(opts: {
  label: string;
  owner: Address;
  townName: string;
  env: NodeJS.ProcessEnv;
}): Promise<void> {
  const key = opts.env.ENS_TREASURER_PRIVATE_KEY?.trim();
  if (!key) throw new SourceError(501, "NOT_IMPLEMENTED", "ENS_TREASURER_PRIVATE_KEY is not set");
  const rpc = opts.env.SEPOLIA_RPC_URL?.trim() || READONLY_RPC;
  const town = loadTown();
  const account = privateKeyToAccount(hexKey(key));
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpc) });
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpc) });
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
    encodeSetText(dns, ENS_KEYS.avatar, `http://localhost:3000${VISITOR_AVATAR}`),
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
{"kind":"refuse","reason":"I can only check my balance or deposit into the town bank."}
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
  const path = deps.artifactPath ?? DEFAULT_VISITOR_PATH;
  const env = deps.env ?? process.env;
  const townName = deps.townName;

  async function balanceOf(art: VisitorArtifact): Promise<string> {
    try {
      return await deps.readBalance(art.address);
    } catch {
      return "0";
    }
  }

  return {
    getVisitor() {
      const art = readVisitorArtifact(path);
      if (!art) return null;
      return toResponse(art, "0");
    },

    async visitorSummary() {
      const art = readVisitorArtifact(path);
      if (!art) return null;
      return toSummary(art, await balanceOf(art));
    },

    async createVisitor(body) {
      requireBroadcast(deps.broadcastAllowed, "Visitor create");
      let label: string;
      try {
        label = validateVisitorLabel(body.label);
      } catch (e) {
        throw new SourceError(400, "BAD_REQUEST", e instanceof Error ? e.message : "Invalid name");
      }
      const existing = readVisitorArtifact(path);
      if (existing && existing.label !== label) {
        throw new SourceError(400, "BAD_REQUEST", `Visitor already admitted as ${existing.label}`);
      }
      if (existing && existing.label === label) {
        return toResponse(existing, await balanceOf(existing));
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
      };
      writeVisitorArtifact(art, path);
      return toResponse(art, await balanceOf(art));
    },

    async chatVisitor(body) {
      requireBroadcast(deps.broadcastAllowed, "Visitor chat");
      const art = readVisitorArtifact(path);
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
      if (intent.kind === "refuse") {
        return { reply: intent.reason, txHash: null, explorerUrl: null };
      }
      const amount =
        intent.kind === "deposit_percent" ? percentOf(bal, intent.bps) : intent.amountUsdc;
      if (BigInt(amount) <= 0n) {
        return {
          reply: "Nothing to deposit — send Arc USDC to my wallet first, then refresh.",
          txHash: null,
          explorerUrl: null,
        };
      }
      if (BigInt(amount) > BigInt(bal)) {
        return { reply: `I only have ${formatUsdcHuman(bal)}.`, txHash: null, explorerUrl: null };
      }
      const tx = await depositUsdc(deps.circle, art.walletId, amount);
      return {
        reply: `Deposited ${formatUsdcHuman(amount)} into the town bank.`,
        txHash: tx.txHash,
        explorerUrl: tx.explorerUrl,
      };
    },
  };
}

export function visitorFileExists(path: string = DEFAULT_VISITOR_PATH): boolean {
  return existsSync(path);
}
