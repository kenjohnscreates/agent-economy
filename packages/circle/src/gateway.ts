// M9.1 Circle Gateway — gus ETH-SEPOLIA SCA (same 0x as Arc gus via deriveWallet).
// Inputs: injected CircleClient, existing wallet set, roster.json (read-only), optional gateway-gus.json.
// Outputs: Sepolia SCA {walletId, address} persisted beside roster (does not touch
// WalletRosterSchema). CREATE2 clones of ada/bo/… are rejected. Deposit is approve +
// GatewayWallet.deposit — never ERC-20 transfer.
// Docs: https://developers.circle.com/gateway/howtos/create-unified-usdc-balance
// Derive: PUT /v1/w3s/developer/wallets/{id}/blockchains/{blockchain}
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ARC_USDC_ADDRESS } from "@agent-town/shared";
import { z } from "zod";
import { ETH_SEPOLIA_BLOCKCHAIN, type CircleClient } from "./client.js";
import { DEFAULT_FEE, executeContract, waitComplete, type WaitOptions } from "./execute.js";
import { LIVE_TREASURY_ADDRESS } from "./fund.js";
import {
  AddressSchema,
  rosterOwnerOfAddress,
  walletFor,
  type WalletName,
  type WalletRoster,
} from "./roster.js";
import type { Logger } from "./wallets.js";
import { silentLogger } from "./wallets.js";

export const EXISTING_WALLET_SET_ID = "949545dc-5e02-5050-8e2f-7e6bc12bfed3";
export const GUS_VISITOR_NAME = "gus" as const satisfies WalletName;
export const GUS_SEPOLIA_REF_ID = "gus-eth-sepolia";
/** CREATE2 on a new chain walks roster order; stop before grinding unused wallets. */
export const MAX_SEPOLIA_CREATE_ATTEMPTS = 12;
/** Circle Sepolia USDC — not ENS MockUSDC, not Arc 0x3600…. */
export const SEPOLIA_USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
export const GATEWAY_WALLET_ADDRESS = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
export const GATEWAY_MINTER_ADDRESS = "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B";
export const GATEWAY_API_BASE = "https://gateway-api-testnet.circle.com";
export const GATEWAY_DOMAIN_SEPOLIA = 0;
export const GATEWAY_DOMAIN_ARC = 26;
export const SEPOLIA_GATEWAY_CONFIRMATIONS = 65;
export const GATEWAY_DEPOSIT_USDC_6 = 2_000_000n; // 2 USDC
export const GATEWAY_TRANSFER_USDC_6 = 800_000n; // 0.8 USDC; ~1.02 USDC Gateway+forwarder fee fits in 2 USDC deposit
export const GATEWAY_APPROVE_FN = "approve(address,uint256)";
export const GATEWAY_DEPOSIT_FN = "deposit(address,uint256)";

export const GatewayGusArtifactSchema = z.object({
  blockchain: z.literal(ETH_SEPOLIA_BLOCKCHAIN),
  accountType: z.literal("SCA"),
  walletSetId: z.string().min(1),
  refId: z.literal(GUS_SEPOLIA_REF_ID),
  walletId: z.string().min(1),
  address: AddressSchema,
  usdc: z.literal(SEPOLIA_USDC_ADDRESS),
  gatewayWallet: z.literal(GATEWAY_WALLET_ADDRESS),
  domain: z.literal(GATEWAY_DOMAIN_SEPOLIA),
  faucet: z
    .object({
      ok: z.boolean(),
      status: z.number(),
      detail: z.string(),
    })
    .optional(),
  deposit: z
    .object({
      amountUsdc6: z.string(),
      approveTxId: z.string().optional(),
      approveTxHash: z.string().optional(),
      depositTxId: z.string().optional(),
      depositTxHash: z.string().optional(),
    })
    .optional(),
  transfer: z
    .object({
      recipient: z.string(),
      amountUsdc6: z.string(),
      transferId: z.string().optional(),
      mintTxHash: z.string().optional(),
      blocked: z.string().optional(),
    })
    .optional(),
});
export type GatewayGusArtifact = z.infer<typeof GatewayGusArtifactSchema>;

export const DEFAULT_GATEWAY_GUS_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "gateway-gus.json",
);

export function readGatewayGus(path: string = DEFAULT_GATEWAY_GUS_PATH): GatewayGusArtifact | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  return GatewayGusArtifactSchema.parse(JSON.parse(raw));
}

export function writeGatewayGus(
  artifact: GatewayGusArtifact,
  path: string = DEFAULT_GATEWAY_GUS_PATH,
): void {
  const valid = GatewayGusArtifactSchema.parse(artifact);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(valid, null, 2)}\n`, "utf8");
}

export function toGatewayGusArtifact(input: {
  walletSetId: string;
  walletId: string;
  address: string;
}): GatewayGusArtifact {
  return GatewayGusArtifactSchema.parse({
    blockchain: ETH_SEPOLIA_BLOCKCHAIN,
    accountType: "SCA",
    walletSetId: input.walletSetId,
    refId: GUS_SEPOLIA_REF_ID,
    walletId: input.walletId,
    address: input.address,
    usdc: SEPOLIA_USDC_ADDRESS,
    gatewayWallet: GATEWAY_WALLET_ADDRESS,
    domain: GATEWAY_DOMAIN_SEPOLIA,
  });
}

/** --yes is live; --dry-run wins over --yes; neither flag is dry-run (no API). */
export function gatewayWantsLive(flags: { yes?: boolean; dryRun?: boolean }): boolean {
  return Boolean(flags.yes) && !flags.dryRun;
}

/** Deposit broadcast: `--yes` AND `ALLOW_BROADCAST=true` (same pair as seed-cy-loan). */
export function gatewayDepositAllowed(
  flags: { yes?: boolean; dryRun?: boolean },
  env: Record<string, string | undefined> = process.env,
): boolean {
  return gatewayWantsLive(flags) && env.ALLOW_BROADCAST === "true";
}

export function missingGatewayDepositGates(
  flags: { yes?: boolean; dryRun?: boolean },
  env: Record<string, string | undefined> = process.env,
): string[] {
  const missing: string[] = [];
  if (!flags.yes || flags.dryRun) missing.push("--yes");
  if (env.ALLOW_BROADCAST !== "true") missing.push("ALLOW_BROADCAST=true");
  return missing;
}

export function assertGatewayDepositBroadcast(
  flags: { yes?: boolean; dryRun?: boolean },
  env: Record<string, string | undefined> = process.env,
): void {
  const missing = missingGatewayDepositGates(flags, env);
  if (missing.length === 0) return;
  throw new Error(
    `refusing to broadcast: need ${missing.join(" and ")} (see seed-cy-loan)`,
  );
}

export function gatewayGusAddressOk(address: string, roster?: WalletRoster | null): boolean {
  if (!roster) return true;
  const owner = rosterOwnerOfAddress(roster, address);
  return owner == null || owner.name === GUS_VISITOR_NAME;
}

/** createWallets on a new chain must not reuse another agent's CREATE2 0x. */
export function assertNewChainAddressNotForeign(
  address: string,
  roster: WalletRoster,
  expectedName: WalletName = GUS_VISITOR_NAME,
): void {
  const owner = rosterOwnerOfAddress(roster, address);
  if (owner && owner.name !== expectedName) {
    throw new Error(
      `createWallets returned ${address} which is already roster ${owner.name} (${owner.walletId}); refusing to label it ${expectedName}`,
    );
  }
}

export function pinWalletSetId(envSetId?: string | null): string {
  if (envSetId && envSetId !== EXISTING_WALLET_SET_ID) {
    throw new Error(
      `CIRCLE_WALLET_SET_ID does not match pinned set ${EXISTING_WALLET_SET_ID}; refusing to mix sets`,
    );
  }
  return EXISTING_WALLET_SET_ID;
}

export interface GatewayGusPlan {
  blockchain: typeof ETH_SEPOLIA_BLOCKCHAIN;
  accountType: "SCA";
  walletSetId: string;
  refId: typeof GUS_SEPOLIA_REF_ID;
  usdc: typeof SEPOLIA_USDC_ADDRESS;
  gatewayWallet: typeof GATEWAY_WALLET_ADDRESS;
  domain: typeof GATEWAY_DOMAIN_SEPOLIA;
  artifactPath: string;
  existingAddress: string | null;
  existingWalletId: string | null;
  collisionAddress: string | null;
  willCreate: boolean;
  arcGusAddress: string | null;
  arcGusWalletId: string | null;
}

export function buildGatewayGusPlan(opts: {
  artifact: GatewayGusArtifact | null;
  artifactPath?: string;
  envSetId?: string | null;
  roster?: WalletRoster | null;
}): GatewayGusPlan {
  const walletSetId = pinWalletSetId(opts.envSetId);
  const existing = opts.artifact;
  const usable = existing != null && gatewayGusAddressOk(existing.address, opts.roster);
  const gus = opts.roster ? opts.roster.wallets.find((w) => w.name === GUS_VISITOR_NAME) : undefined;
  return {
    blockchain: ETH_SEPOLIA_BLOCKCHAIN,
    accountType: "SCA",
    walletSetId,
    refId: GUS_SEPOLIA_REF_ID,
    usdc: SEPOLIA_USDC_ADDRESS,
    gatewayWallet: GATEWAY_WALLET_ADDRESS,
    domain: GATEWAY_DOMAIN_SEPOLIA,
    artifactPath: opts.artifactPath ?? DEFAULT_GATEWAY_GUS_PATH,
    existingAddress: usable && existing ? existing.address : null,
    existingWalletId: usable && existing ? existing.walletId : null,
    collisionAddress: existing && !usable ? existing.address : null,
    willCreate: !usable,
    arcGusAddress: gus?.address ?? null,
    arcGusWalletId: gus?.walletId ?? null,
  };
}

export function formatGatewayGusPlan(plan: GatewayGusPlan): string {
  const lines = [
    `setup-gateway-gus plan  (artifact: ${plan.artifactPath})`,
    `  blockchain     : ${plan.blockchain}   accountType: ${plan.accountType}`,
    `  wallet set     : verify ${plan.walletSetId} (getWalletSet; never create)`,
    `  refId          : ${plan.refId}  (NOT gus — Arc gus keeps that)`,
    `  Arc gus        : ${plan.arcGusAddress ? `${plan.arcGusAddress}  ${plan.arcGusWalletId}` : "—"}`,
    `  token          : ${plan.usdc} (Circle Sepolia USDC, not ENS MockUSDC)`,
    `  GatewayWallet  : ${plan.gatewayWallet}  domain=${plan.domain}`,
    `  already have   : ${plan.existingAddress ? `${plan.existingAddress}  ${plan.existingWalletId}` : "—"}`,
    ...(plan.collisionAddress
      ? [
          `  REJECT         : ${plan.collisionAddress} is another roster name (CREATE2 clone) — will not label as gus`,
        ]
      : []),
    `  API calls      : ${
      plan.willCreate
        ? "1 getWalletSet + listWallets + deriveWallet(Arc gus → ETH-SEPOLIA) or createWallets until unique/gus"
        : "1 getWalletSet + 1 listWallets — artifact complete (idempotent skip create)"
    }`,
  ];
  return lines.join("\n");
}

function circleErr(e: unknown): string {
  if (e && typeof e === "object" && "code" in e && "message" in e) {
    return `${String((e as { code: unknown }).code)} ${(e as { message: unknown }).message}`;
  }
  return e instanceof Error ? e.message : String(e);
}

function sepoliaWalletOk(
  w: { id: string; address: string } | undefined,
  roster: WalletRoster,
): boolean {
  return Boolean(w && gatewayGusAddressOk(w.address, roster));
}

export async function ensureGatewayGusWallet(
  client: CircleClient,
  walletSetId: string,
  opts: { log?: Logger; roster: WalletRoster },
): Promise<{
  walletId: string;
  address: string;
  created: boolean;
  recovered: boolean;
  derived: boolean;
}> {
  const log = opts.log ?? silentLogger;
  const roster = opts.roster;
  const pinned = pinWalletSetId(walletSetId);
  const gus = walletFor(roster, GUS_VISITOR_NAME);

  try {
    const byAddress = await client.listWallets({
      walletSetId: pinned,
      address: gus.address,
      blockchain: ETH_SEPOLIA_BLOCKCHAIN,
    });
    const sameAddr = byAddress.data?.wallets?.find(
      (w) => w.address.toLowerCase() === gus.address.toLowerCase(),
    );
    if (sameAddr && sepoliaWalletOk(sameAddr, roster)) {
      log.info(`Recovered Arc gus on ${ETH_SEPOLIA_BLOCKCHAIN}: ${sameAddr.address} (${sameAddr.id})`);
      return {
        walletId: sameAddr.id,
        address: sameAddr.address,
        created: false,
        recovered: true,
        derived: false,
      };
    }
  } catch (e) {
    log.warn(`listWallets(address) failed (${circleErr(e)}); continuing`);
  }

  const listed = await client.listWallets({
    walletSetId: pinned,
    refId: GUS_SEPOLIA_REF_ID,
    blockchain: ETH_SEPOLIA_BLOCKCHAIN,
  });
  const found = listed.data?.wallets?.find((w) => w.refId === GUS_SEPOLIA_REF_ID);
  if (found) {
    if (sepoliaWalletOk(found, roster)) {
      log.info(`Recovered existing wallet for ${GUS_SEPOLIA_REF_ID}: ${found.address} (${found.id})`);
      return {
        walletId: found.id,
        address: found.address,
        created: false,
        recovered: true,
        derived: false,
      };
    }
    log.warn(
      `Ignoring ${GUS_SEPOLIA_REF_ID} ${found.address} (${found.id}) — address is another roster name, not gus`,
    );
  }

  try {
    const derived = await client.deriveWallet({
      id: gus.walletId,
      blockchain: ETH_SEPOLIA_BLOCKCHAIN,
      metadata: { name: GUS_SEPOLIA_REF_ID, refId: GUS_SEPOLIA_REF_ID },
    });
    const w = derived.data?.wallet;
    if (w?.id && w.address) {
      assertNewChainAddressNotForeign(w.address, roster, GUS_VISITOR_NAME);
      log.info(`Derived ETH-SEPOLIA from Arc gus ${gus.walletId}: ${w.address} (${w.id})`);
      return {
        walletId: w.id,
        address: w.address,
        created: false,
        recovered: false,
        derived: true,
      };
    }
    log.warn("deriveWallet returned no wallet; falling back to createWallets");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/already roster/.test(msg)) throw e;
    log.warn(`deriveWallet failed (${circleErr(e)}); falling back to createWallets`);
  }

  for (let i = 0; i < MAX_SEPOLIA_CREATE_ATTEMPTS; i++) {
    const res = await client.createWallets({
      walletSetId: pinned,
      accountType: "SCA",
      blockchains: [ETH_SEPOLIA_BLOCKCHAIN],
      count: 1,
      metadata: [{ name: GUS_SEPOLIA_REF_ID, refId: GUS_SEPOLIA_REF_ID }],
    });
    const wallets = res.data?.wallets ?? [];
    const w = wallets.find((x) => x.refId === GUS_SEPOLIA_REF_ID) ?? wallets[0];
    if (!w) throw new Error("createWallets returned no ETH-SEPOLIA gus wallet");
    try {
      assertNewChainAddressNotForeign(w.address, roster, GUS_VISITOR_NAME);
    } catch (e) {
      log.warn(e instanceof Error ? e.message : String(e));
      continue;
    }
    log.info(`Created wallet for ${GUS_SEPOLIA_REF_ID}: ${w.address} (${w.id})`);
    return { walletId: w.id, address: w.address, created: true, recovered: false, derived: false };
  }
  throw new Error(
    `createWallets: no ETH-SEPOLIA address unique vs roster (or ${GUS_VISITOR_NAME}) after ${MAX_SEPOLIA_CREATE_ATTEMPTS} attempts`,
  );
}

export type GatewayDepositStep =
  | { kind: "approve"; fn: typeof GATEWAY_APPROVE_FN; token: typeof SEPOLIA_USDC_ADDRESS; spender: typeof GATEWAY_WALLET_ADDRESS; amountUsdc6: bigint }
  | { kind: "deposit"; fn: typeof GATEWAY_DEPOSIT_FN; gateway: typeof GATEWAY_WALLET_ADDRESS; token: typeof SEPOLIA_USDC_ADDRESS; amountUsdc6: bigint };

export function buildGatewayDepositPlan(amountUsdc6: bigint = GATEWAY_DEPOSIT_USDC_6): {
  amountUsdc6: bigint;
  steps: GatewayDepositStep[];
} {
  if (amountUsdc6 <= 0n) throw new Error("deposit amount must be positive 6-dec USDC");
  return {
    amountUsdc6,
    steps: [
      {
        kind: "approve",
        fn: GATEWAY_APPROVE_FN,
        token: SEPOLIA_USDC_ADDRESS,
        spender: GATEWAY_WALLET_ADDRESS,
        amountUsdc6,
      },
      {
        kind: "deposit",
        fn: GATEWAY_DEPOSIT_FN,
        gateway: GATEWAY_WALLET_ADDRESS,
        token: SEPOLIA_USDC_ADDRESS,
        amountUsdc6,
      },
    ],
  };
}

export function formatGatewayDepositPlan(plan: ReturnType<typeof buildGatewayDepositPlan>): string {
  return [
    `gateway-deposit plan  (NOT an ERC-20 transfer — that burns funds)`,
    `  amount         : ${plan.amountUsdc6} (6-dec)  Circle Sepolia USDC ${SEPOLIA_USDC_ADDRESS}`,
    `  1. ${GATEWAY_APPROVE_FN} spender=${GATEWAY_WALLET_ADDRESS}`,
    `  2. GatewayWallet.${GATEWAY_DEPOSIT_FN} token=${SEPOLIA_USDC_ADDRESS} value=${plan.amountUsdc6}`,
    `  then wait ${SEPOLIA_GATEWAY_CONFIRMATIONS} Sepolia blocks (~13 min)`,
    `  then Gateway transfer/mint → Arc TownTreasury ${LIVE_TREASURY_ADDRESS}`,
  ].join("\n");
}

export async function executeGatewayDeposit(
  client: CircleClient,
  input: { walletId: string; amountUsdc6?: bigint; log?: Logger; wait?: WaitOptions },
): Promise<{
  approveTxId: string;
  depositTxId: string;
  approveTxHash?: string;
  depositTxHash?: string;
  amountUsdc6: string;
}> {
  const amount = input.amountUsdc6 ?? GATEWAY_DEPOSIT_USDC_6;
  const plan = buildGatewayDepositPlan(amount);
  const log = input.log ?? silentLogger;
  const approveStep = plan.steps[0];
  const depositStep = plan.steps[1];
  if (!approveStep || approveStep.kind !== "approve") throw new Error("deposit plan missing approve");
  if (!depositStep || depositStep.kind !== "deposit") throw new Error("deposit plan missing deposit");

  log.info(`approve GatewayWallet for ${amount} USDC-6`);
  const approve = await executeContract(client, {
    walletId: input.walletId,
    contractAddress: approveStep.token,
    abiFunctionSignature: approveStep.fn,
    abiParameters: [approveStep.spender, amount.toString()],
    fee: DEFAULT_FEE,
    refId: `${GUS_SEPOLIA_REF_ID}-approve`,
  });
  const approveDone = await waitComplete(client, approve.txId, input.wait);
  log.info(`approve COMPLETE ${approve.txId}${approveDone.txHash ? ` ${approveDone.txHash}` : ""}`);

  log.info(`deposit(${SEPOLIA_USDC_ADDRESS}, ${amount}) on GatewayWallet`);
  const deposit = await executeContract(client, {
    walletId: input.walletId,
    contractAddress: depositStep.gateway,
    abiFunctionSignature: depositStep.fn,
    abiParameters: [depositStep.token, amount.toString()],
    fee: DEFAULT_FEE,
    refId: `${GUS_SEPOLIA_REF_ID}-deposit`,
  });
  const depositDone = await waitComplete(client, deposit.txId, input.wait);
  log.info(`deposit COMPLETE ${deposit.txId}${depositDone.txHash ? ` ${depositDone.txHash}` : ""}`);

  return {
    approveTxId: approve.txId,
    depositTxId: deposit.txId,
    approveTxHash: approveDone.txHash,
    depositTxHash: depositDone.txHash,
    amountUsdc6: amount.toString(),
  };
}

export async function waitSepoliaConfirmations(opts: {
  fromBlock: bigint;
  confirmations?: number;
  getBlockNumber: () => Promise<bigint>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
}): Promise<{ fromBlock: bigint; current: bigint; confirmations: number }> {
  const need = opts.confirmations ?? SEPOLIA_GATEWAY_CONFIRMATIONS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? 20 * 60_000;
  const start = now();
  const target = opts.fromBlock + BigInt(need);
  for (;;) {
    const current = await opts.getBlockNumber();
    if (current >= target) return { fromBlock: opts.fromBlock, current, confirmations: need };
    if (now() - start >= timeoutMs) {
      throw new Error(
        `Sepolia confirmations timed out after ${timeoutMs}ms (from ${opts.fromBlock} need ${need}, now ${current})`,
      );
    }
    await sleep(12_000);
  }
}

export function addressToBytes32(address: string): `0x${string}` {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}` as `0x${string}`;
}

export function stringifyTypedData<T>(obj: T): string {
  return JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

export function defaultGatewayRecipient(): string {
  return LIVE_TREASURY_ADDRESS;
}

export function gatewayTransferDestToken(): typeof ARC_USDC_ADDRESS {
  return ARC_USDC_ADDRESS;
}

export type SigningClient = CircleClient & {
  signTypedData(input: {
    walletId?: string;
    walletAddress?: string;
    blockchain?: string;
    data: string;
  }): Promise<{ data?: { signature?: string } }>;
};

export function asSigningClient(client: CircleClient): SigningClient {
  const c = client as SigningClient;
  if (typeof c.signTypedData !== "function") {
    throw new Error("Circle client has no signTypedData (needed for Gateway burn intent)");
  }
  return c;
}

const EIP712Domain = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
];
const TransferSpec = [
  { name: "version", type: "uint32" },
  { name: "sourceDomain", type: "uint32" },
  { name: "destinationDomain", type: "uint32" },
  { name: "sourceContract", type: "bytes32" },
  { name: "destinationContract", type: "bytes32" },
  { name: "sourceToken", type: "bytes32" },
  { name: "destinationToken", type: "bytes32" },
  { name: "sourceDepositor", type: "bytes32" },
  { name: "destinationRecipient", type: "bytes32" },
  { name: "sourceSigner", type: "bytes32" },
  { name: "destinationCaller", type: "bytes32" },
  { name: "value", type: "uint256" },
  { name: "salt", type: "bytes32" },
  { name: "hookData", type: "bytes" },
];
const BurnIntent = [
  { name: "maxBlockHeight", type: "uint256" },
  { name: "maxFee", type: "uint256" },
  { name: "spec", type: "TransferSpec" },
];

export function buildGatewayTransferSpec(input: {
  depositor: string;
  recipient: string;
  valueUsdc6: bigint;
  salt: `0x${string}`;
}): {
  version: number;
  sourceDomain: number;
  destinationDomain: number;
  sourceContract: `0x${string}`;
  destinationContract: `0x${string}`;
  sourceToken: `0x${string}`;
  destinationToken: `0x${string}`;
  sourceDepositor: `0x${string}`;
  destinationRecipient: `0x${string}`;
  sourceSigner: `0x${string}`;
  destinationCaller: `0x${string}`;
  value: bigint;
  salt: `0x${string}`;
  hookData: `0x${string}`;
} {
  const zero = addressToBytes32("0x0000000000000000000000000000000000000000");
  return {
    version: 1,
    sourceDomain: GATEWAY_DOMAIN_SEPOLIA,
    destinationDomain: GATEWAY_DOMAIN_ARC,
    sourceContract: addressToBytes32(GATEWAY_WALLET_ADDRESS),
    destinationContract: addressToBytes32(GATEWAY_MINTER_ADDRESS),
    sourceToken: addressToBytes32(SEPOLIA_USDC_ADDRESS),
    destinationToken: addressToBytes32(ARC_USDC_ADDRESS),
    sourceDepositor: addressToBytes32(input.depositor),
    destinationRecipient: addressToBytes32(input.recipient),
    sourceSigner: addressToBytes32(input.depositor),
    destinationCaller: zero,
    value: input.valueUsdc6,
    salt: input.salt,
    hookData: "0x",
  };
}

export async function submitGatewayForwardingTransfer(input: {
  client: CircleClient;
  walletId: string;
  depositor: string;
  recipient: string;
  valueUsdc6: bigint;
  salt: `0x${string}`;
  fetch?: typeof fetch;
  log?: Logger;
}): Promise<{ transferId: string; mintTxHash?: string; blocked?: string }> {
  const log = input.log ?? silentLogger;
  const fetchFn = input.fetch ?? globalThis.fetch;
  const spec = buildGatewayTransferSpec({
    depositor: input.depositor,
    recipient: input.recipient,
    valueUsdc6: input.valueUsdc6,
    salt: input.salt,
  });

  const estimateResponse = await fetchFn(`${GATEWAY_API_BASE}/v1/estimate?enableForwarder=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stringifyTypedData([{ spec }]),
  });
  if (!estimateResponse.ok) {
    const text = await estimateResponse.text();
    throw new Error(`Gateway estimate ${estimateResponse.status}: ${text.slice(0, 300)}`);
  }
  const estimateResult = (await estimateResponse.json()) as {
    body?: Array<{ burnIntent?: { maxFee?: string; maxBlockHeight?: string } }>;
  };
  const estimated = estimateResult.body?.[0]?.burnIntent;
  if (!estimated?.maxFee || !estimated.maxBlockHeight) {
    throw new Error("Gateway estimate missing burnIntent maxFee/maxBlockHeight");
  }

  const typedData = {
    types: { EIP712Domain, TransferSpec, BurnIntent },
    domain: { name: "GatewayWallet", version: "1" },
    primaryType: "BurnIntent" as const,
    message: {
      maxBlockHeight: BigInt(estimated.maxBlockHeight),
      maxFee: BigInt(estimated.maxFee),
      spec,
    },
  };

  let signature: string;
  try {
    const signer = asSigningClient(input.client);
    const sigResp = await signer.signTypedData({
      walletId: input.walletId,
      data: stringifyTypedData(typedData),
    });
    if (!sigResp.data?.signature) throw new Error("signTypedData returned no signature");
    signature = sigResp.data.signature;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`Gateway burn-intent sign failed: ${msg}`);
    return {
      transferId: "",
      blocked: `signTypedData: ${msg}`,
    };
  }

  const response = await fetchFn(`${GATEWAY_API_BASE}/v1/transfer?enableForwarder=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stringifyTypedData([
      { burnIntent: typedData.message, signature, contractSigner: true },
    ]),
  });
  if (!response.ok) {
    const text = await response.text();
    const blocked = `Gateway transfer ${response.status}: ${text.slice(0, 300)}`;
    if (response.status === 400 && /1271|smart contract|SCA|signer/i.test(text)) {
      return { transferId: "", blocked };
    }
    throw new Error(blocked);
  }
  const json = (await response.json()) as { transferId?: string };
  if (!json.transferId) throw new Error("Gateway transfer missing transferId");
  log.info(`Gateway transferId ${json.transferId}`);
  const mintTxHash = await pollGatewayTransfer(json.transferId, { fetch: fetchFn, log });
  return { transferId: json.transferId, mintTxHash };
}

export async function pollGatewayTransfer(
  transferId: string,
  opts: { fetch?: typeof fetch; log?: Logger; timeoutMs?: number; pollMs?: number } = {},
): Promise<string | undefined> {
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const log = opts.log ?? silentLogger;
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const pollMs = opts.pollMs ?? 5_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const pollRes = await fetchFn(`${GATEWAY_API_BASE}/v1/transfer/${transferId}`);
    if (pollRes.ok) {
      const details = (await pollRes.json()) as {
        status?: string;
        transactionHash?: string;
        forwardingDetails?: { failureReason?: string };
      };
      log.info(`Gateway transfer status ${details.status ?? "?"}`);
      if (details.status === "finalized" || details.status === "confirmed") {
        return details.transactionHash;
      }
      if (details.status === "failed") {
        throw new Error(`Gateway transfer failed: ${details.forwardingDetails?.failureReason ?? "unknown"}`);
      }
      if (details.status === "expired") throw new Error("Gateway transfer attestation expired");
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Gateway transfer ${transferId} not terminal after ${timeoutMs}ms`);
}
