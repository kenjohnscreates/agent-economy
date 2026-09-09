// M1.5 ERC-8183 job e2e plan. Merchant createJob → fund escrow USDC → worker
// submit → merchant complete. Inputs: roster wallets, AgenticCommerce ABI,
// 6-dec USDC amount. Outputs: 4-stage call plan; live expands fund escrow to
// setBudget + approve + fund (reference contract). Never absoluteFee.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ARC_USDC_ADDRESS, ERC8183_ADDRESS, type Address } from "@agent-town/shared";
import {
  keccak256,
  parseAbiItem,
  parseEventLogs,
  toHex,
  zeroAddress,
  type Abi,
  type Hex,
  type Log,
} from "viem";
import type { CircleClient } from "./client.js";
import {
  DEFAULT_FEE,
  executeContract,
  waitComplete,
  type ExecuteContractInput,
} from "./execute.js";
import { formatUsdc6 } from "./fund.js";
import type { RosterWallet, WalletName } from "./roster.js";

export const AGENTIC_ABI_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "subgraph",
  "abis",
  "AgenticCommerce.json",
);

export const DEFAULT_MERCHANT_NAME = "bo" as const satisfies WalletName;
export const DEFAULT_WORKER_NAME = "dee" as const satisfies WalletName;
/** 0.5 USDC (6-dec). Leaves gas/spendable on 2 USDC agent wallets. */
export const JOB_AMOUNT_USDC_6 = 500_000n;
export const JOB_ID_PLACEHOLDER = "<jobId>";
export const ZERO_HOOK = zeroAddress;
export const EMPTY_BYTES = "0x";
export const JOB_DESCRIPTION = "M1.5 e2e: merchant posts 0.5 USDC job for worker";
export const DELIVERABLE_HASH = keccak256(toHex("agent-town/m1.5/deliverable"));
export const COMPLETE_REASON = keccak256(toHex("accepted"));
/** ExpiryTooShort is 5 minutes; 1h matches the Arc ERC-8183 tutorial. */
export const EXPIRY_SECONDS = 3600n;
export const USDC_APPROVE_SIGNATURE = "approve(address,uint256)";

export type JobStageId = 1 | 2 | 3 | 4;
export type JobStageName = "createJob" | "fundEscrow" | "submit" | "complete";
export type JobCallKind = "createJob" | "setBudget" | "approve" | "fund" | "submit" | "complete";

export interface JobCall {
  stage: JobStageId;
  stageName: JobStageName;
  kind: JobCallKind;
  fromName: WalletName;
  walletId: string;
  contractAddress: Address;
  abiFunctionSignature: string;
  abiParameters: string[];
}

export interface JobPlan {
  merchant: RosterWallet;
  worker: RosterWallet;
  jobs: Address;
  usdc: Address;
  amountUsdc6: bigint;
  expiredAt: bigint;
  description: string;
  hook: Address;
  deliverableHash: Hex;
  reasonHash: Hex;
  jobId: string;
  calls: JobCall[];
}

export function loadAgenticAbi(): Abi {
  return JSON.parse(readFileSync(AGENTIC_ABI_PATH, "utf8")) as Abi;
}

export function abiFunctionSignature(abi: Abi, name: string): string {
  const item = abi.find((x) => x.type === "function" && "name" in x && x.name === name);
  if (!item || item.type !== "function") throw new Error(`AgenticCommerce ABI missing ${name}()`);
  const types = item.inputs.map((i) => i.type).join(",");
  return `${name}(${types})`;
}

export function resolveJobsAddress(env: Record<string, string | undefined> = process.env): Address {
  const raw = env.ERC8183_ADDRESS?.trim();
  if (raw && /^0x[0-9a-fA-F]{40}$/.test(raw)) return raw as Address;
  return ERC8183_ADDRESS;
}

export interface JobPlanInput {
  merchant: RosterWallet;
  worker: RosterWallet;
  jobs?: Address;
  usdc?: Address;
  amountUsdc6?: bigint;
  expiredAt: bigint;
  description?: string;
  hook?: Address;
  deliverableHash?: Hex;
  reasonHash?: Hex;
  jobId?: string;
  abi?: Abi;
}

interface JobCallParts {
  merchant: RosterWallet;
  worker: RosterWallet;
  jobs: Address;
  usdc: Address;
  jobId: string;
  amt: string;
  expired: string;
  description: string;
  hook: Address;
  deliverableHash: Hex;
  reasonHash: Hex;
  sig: (name: string) => string;
}

function jobCalls(p: JobCallParts): JobCall[] {
  return [
    {
      stage: 1,
      stageName: "createJob",
      kind: "createJob",
      fromName: p.merchant.name,
      walletId: p.merchant.walletId,
      contractAddress: p.jobs,
      abiFunctionSignature: p.sig("createJob"),
      abiParameters: [p.worker.address, p.merchant.address, p.expired, p.description, p.hook],
    },
    {
      stage: 2,
      stageName: "fundEscrow",
      kind: "setBudget",
      fromName: p.worker.name,
      walletId: p.worker.walletId,
      contractAddress: p.jobs,
      abiFunctionSignature: p.sig("setBudget"),
      abiParameters: [p.jobId, p.amt, EMPTY_BYTES],
    },
    {
      stage: 2,
      stageName: "fundEscrow",
      kind: "approve",
      fromName: p.merchant.name,
      walletId: p.merchant.walletId,
      contractAddress: p.usdc,
      abiFunctionSignature: USDC_APPROVE_SIGNATURE,
      abiParameters: [p.jobs, p.amt],
    },
    {
      stage: 2,
      stageName: "fundEscrow",
      kind: "fund",
      fromName: p.merchant.name,
      walletId: p.merchant.walletId,
      contractAddress: p.jobs,
      abiFunctionSignature: p.sig("fund"),
      abiParameters: [p.jobId, EMPTY_BYTES],
    },
    {
      stage: 3,
      stageName: "submit",
      kind: "submit",
      fromName: p.worker.name,
      walletId: p.worker.walletId,
      contractAddress: p.jobs,
      abiFunctionSignature: p.sig("submit"),
      abiParameters: [p.jobId, p.deliverableHash, EMPTY_BYTES],
    },
    {
      stage: 4,
      stageName: "complete",
      kind: "complete",
      fromName: p.merchant.name,
      walletId: p.merchant.walletId,
      contractAddress: p.jobs,
      abiFunctionSignature: p.sig("complete"),
      abiParameters: [p.jobId, p.reasonHash, EMPTY_BYTES],
    },
  ];
}

/** Four ARCHITECTURE §4.2 stages; fund escrow expands to setBudget + approve + fund. */
export function buildJobPlan(input: JobPlanInput): JobPlan {
  if (input.merchant.name === input.worker.name) {
    throw new Error("merchant and worker must be different roster wallets");
  }
  const amountUsdc6 = input.amountUsdc6 ?? JOB_AMOUNT_USDC_6;
  if (amountUsdc6 <= 0n) throw new Error("job amount must be a positive 6-dec USDC integer");
  const jobs = input.jobs ?? ERC8183_ADDRESS;
  const usdc = input.usdc ?? ARC_USDC_ADDRESS;
  const hook = input.hook ?? ZERO_HOOK;
  const jobId = input.jobId ?? JOB_ID_PLACEHOLDER;
  const merchant = input.merchant;
  const worker = input.worker;
  const description = input.description ?? JOB_DESCRIPTION;
  const deliverableHash = input.deliverableHash ?? DELIVERABLE_HASH;
  const reasonHash = input.reasonHash ?? COMPLETE_REASON;
  const abi = input.abi ?? loadAgenticAbi();
  const calls = jobCalls({
    merchant,
    worker,
    jobs,
    usdc,
    jobId,
    amt: amountUsdc6.toString(),
    expired: input.expiredAt.toString(),
    description,
    hook,
    deliverableHash,
    reasonHash,
    sig: (name) => abiFunctionSignature(abi, name),
  });
  return {
    merchant,
    worker,
    jobs,
    usdc,
    amountUsdc6,
    expiredAt: input.expiredAt,
    description,
    hook,
    deliverableHash,
    reasonHash,
    jobId,
    calls,
  };
}

export function substJobId(call: JobCall, jobId: string): JobCall {
  return {
    ...call,
    abiParameters: call.abiParameters.map((p) => (p === JOB_ID_PLACEHOLDER ? jobId : p)),
  };
}

export function toExecuteInput(call: JobCall, idempotencyKey: string): ExecuteContractInput {
  return {
    walletId: call.walletId,
    contractAddress: call.contractAddress,
    abiFunctionSignature: call.abiFunctionSignature,
    abiParameters: call.abiParameters,
    fee: DEFAULT_FEE,
    idempotencyKey,
  };
}

export function formatJobPlan(plan: JobPlan): string[] {
  const amt = formatUsdc6(plan.amountUsdc6);
  const lines = [
    `job-e2e plan  (ERC-8183 ${plan.jobs}  USDC ${plan.usdc}  6-dec)`,
    `  merchant ${plan.merchant.name} ${plan.merchant.address}  evaluator=merchant`,
    `  worker   ${plan.worker.name} ${plan.worker.address}  provider=worker`,
    `  amount   ${amt}  expiredAt ${plan.expiredAt.toString()}  hook ${plan.hook}`,
    `  fee      DEFAULT_FEE feeLevel MEDIUM  (never absoluteFee)`,
    "  calls:",
    `  1. createJob(provider=${plan.worker.name}, evaluator=${plan.merchant.name}, expiredAt, description, hook=0x0)  wallet=${plan.merchant.name}`,
    `  2. fund escrow ${amt} — ${plan.worker.name} setBudget + ${plan.merchant.name} approve USDC + ${plan.merchant.name} fund()`,
    `  3. submit(deliverableHash=${plan.deliverableHash})  wallet=${plan.worker.name}`,
    `  4. complete(reason=${plan.reasonHash})  wallet=${plan.merchant.name}`,
  ];
  return lines;
}

export const JOB_CREATED_EVENT = parseAbiItem(
  "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)",
);

export function jobIdFromLogs(logs: Log[]): bigint {
  const events = parseEventLogs({ abi: [JOB_CREATED_EVENT], logs, eventName: "JobCreated" });
  const id = events[0]?.args.jobId;
  if (id === undefined) throw new Error("JobCreated event missing from createJob receipt");
  return id;
}

export interface JobE2eDeps {
  executeContract?: typeof executeContract;
  waitComplete?: typeof waitComplete;
  jobIdFromTxHash: (txHash: Hex) => Promise<string>;
  uuid: () => string;
}

export interface JobE2eResult {
  jobId: string;
  txHashes: Partial<Record<JobCallKind, string>>;
  lifecycleHashes: [string, string, string, string];
}

function requireHash(tx: { txHash?: string; id: string }, kind: JobCallKind): string {
  if (!tx.txHash) throw new Error(`${kind} COMPLETE without txHash`);
  return tx.txHash;
}

/** Broadcast the plan. createJob receipt supplies jobId for later calls. */
export async function executeJobE2e(
  client: CircleClient,
  plan: JobPlan,
  deps: JobE2eDeps,
): Promise<JobE2eResult> {
  const exec = deps.executeContract ?? executeContract;
  const wait = deps.waitComplete ?? waitComplete;
  let jobId = plan.jobId;
  const txHashes: Partial<Record<JobCallKind, string>> = {};
  for (const raw of plan.calls) {
    const call = jobId === JOB_ID_PLACEHOLDER ? raw : substJobId(raw, jobId);
    const submitted = await exec(client, toExecuteInput(call, deps.uuid()));
    const tx = await wait(client, submitted.txId);
    txHashes[call.kind] = requireHash(tx, call.kind);
    if (call.kind === "createJob") {
      jobId = await deps.jobIdFromTxHash(tx.txHash as Hex);
    }
  }
  const lifecycle = [txHashes.createJob, txHashes.fund, txHashes.submit, txHashes.complete];
  if (lifecycle.some((h) => !h)) throw new Error("missing lifecycle tx hash");
  return { jobId, txHashes, lifecycleHashes: lifecycle as [string, string, string, string] };
}
