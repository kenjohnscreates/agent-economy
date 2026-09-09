// M1.5 — ERC-8183 job e2e via Circle SCA wallets.
// Inputs: roster.json (bo merchant, dee worker), AgenticCommerce ABI, CIRCLE_* for --yes.
// Outputs: dry-run 4-call plan (default) or lifecycle tx hashes (--yes). Never logs secrets.
// Usage: pnpm --filter @agent-town/circle job-e2e
//        pnpm --filter @agent-town/circle job-e2e --yes   # orchestrator only
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import {
  ARC_EXPLORER_URL,
  ARC_RPC_URL_DEFAULT,
  ARC_TESTNET_CHAIN_ID,
  ARC_USDC_ADDRESS,
} from "@agent-town/shared";
import {
  createPublicClient,
  defineChain,
  erc20Abi,
  getAddress,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  CircleEnvSchema,
  DEFAULT_FEE,
  DEFAULT_MERCHANT_NAME,
  DEFAULT_WORKER_NAME,
  JOB_AMOUNT_USDC_6,
  buildJobPlan,
  createCircleClient,
  executeJobE2e,
  formatJobPlan,
  formatUsdc6,
  jobIdFromLogs,
  readRoster,
  resolveJobsAddress,
  walletFor,
} from "../src/index.js";

const { values: flags } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
  },
  strict: true,
});

const broadcast = Boolean(flags.yes) && !flags["dry-run"];

const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || ARC_RPC_URL_DEFAULT] } },
});

function explorerTx(hash: string): string {
  return `${ARC_EXPLORER_URL}/tx/${hash}`;
}

function formatCircleError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const rec = err as Error & { code?: unknown; response?: { data?: unknown } };
  const parts = [err.message];
  if (rec.code != null) parts.push(`code ${rec.code}`);
  const data = rec.response?.data;
  if (data !== undefined) {
    try {
      parts.push(typeof data === "string" ? data : JSON.stringify(data));
    } catch {
      // ignore unserializable bodies
    }
  }
  return parts.join(" — ");
}

async function readUsdc6(pub: PublicClient, address: Address): Promise<bigint> {
  return pub.readContract({
    address: ARC_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
}

async function main(): Promise<void> {
  const roster = readRoster();
  const merchant = walletFor(roster, DEFAULT_MERCHANT_NAME);
  const worker = walletFor(roster, DEFAULT_WORKER_NAME);
  const jobs = resolveJobsAddress(process.env);
  const pub = createPublicClient({ chain: arcTestnet, transport: http() });

  let expiredAt = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
  let merchantUsdc6 = 0n;
  let workerUsdc6 = 0n;
  try {
    const block = await pub.getBlock();
    expiredAt = block.timestamp + 3600n;
    merchantUsdc6 = await readUsdc6(pub, getAddress(merchant.address) as Address);
    workerUsdc6 = await readUsdc6(pub, getAddress(worker.address) as Address);
  } catch (e) {
    console.warn(`  ! RPC snapshot skipped: ${e instanceof Error ? e.message : String(e)}`);
  }

  const plan = buildJobPlan({ merchant, worker, jobs, expiredAt, amountUsdc6: JOB_AMOUNT_USDC_6 });
  for (const line of formatJobPlan(plan)) console.log(line);
  console.log(`  merchant erc20 ${formatUsdc6(merchantUsdc6)}`);
  console.log(`  worker   erc20 ${formatUsdc6(workerUsdc6)}`);
  console.log(`  DEFAULT_FEE    ${JSON.stringify(DEFAULT_FEE)}`);

  if (!broadcast) {
    console.log("\nRefusing to broadcast without --yes (default is --dry-run).");
    console.log("Orchestrator: pnpm --filter @agent-town/circle job-e2e --yes");
    return;
  }

  const parsed = CircleEnvSchema.safeParse({
    CIRCLE_API_KEY: process.env.CIRCLE_API_KEY || undefined,
    CIRCLE_ENTITY_SECRET: process.env.CIRCLE_ENTITY_SECRET || undefined,
  });
  if (!parsed.success) {
    throw new Error("CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET required for --yes");
  }

  const client = createCircleClient(process.env);
  console.log("\nLIVE broadcast…");
  const before = await readUsdc6(pub, getAddress(worker.address) as Address);
  const result = await executeJobE2e(client, plan, {
    uuid: randomUUID,
    jobIdFromTxHash: async (txHash: Hex) => {
      const receipt = await pub.getTransactionReceipt({ hash: txHash });
      return jobIdFromLogs(receipt.logs).toString();
    },
  });
  const after = await readUsdc6(pub, getAddress(worker.address) as Address);

  console.log(`  jobId ${result.jobId}`);
  const labels = ["createJob", "fund", "submit", "complete"] as const;
  console.log("  lifecycle tx hashes:");
  result.lifecycleHashes.forEach((h, i) => {
    console.log(`  ${i + 1}. ${labels[i]}  ${explorerTx(h)}`);
  });
  if (result.txHashes.setBudget) {
    console.log(`  setBudget  ${explorerTx(result.txHashes.setBudget)}`);
  }
  if (result.txHashes.approve) {
    console.log(`  approve    ${explorerTx(result.txHashes.approve)}`);
  }
  console.log(`  worker erc20 before ${formatUsdc6(before)}  after ${formatUsdc6(after)}`);
  if (after <= before) {
    throw new Error(`worker ERC-20 balance did not increase (${before} → ${after})`);
  }
}

main().catch((e: unknown) => {
  console.error(`\njob-e2e failed: ${formatCircleError(e)}`);
  process.exit(1);
});
