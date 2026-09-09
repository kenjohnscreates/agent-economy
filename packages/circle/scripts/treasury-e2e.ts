// M1.6 — TownTreasury e2e via Circle SCAs (ada treasurer, bo merchant).
// Inputs: roster.json, TOWN_TREASURY_ADDRESS / deployments/arc-testnet.json, CIRCLE_*.
// Amounts are 6-dec USDC base-unit strings. DEFAULT_FEE (feeLevel MEDIUM) — never absoluteFee.
// Outputs: dry-run plan (default) or broadcast txs (--yes). Idempotent. Never logs secrets.
// Usage: pnpm --filter @agent-town/circle treasury-e2e
//        pnpm --filter @agent-town/circle treasury-e2e --yes
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
  parseAbi,
  type Address,
  type PublicClient,
} from "viem";
import {
  CircleEnvSchema,
  DEFAULT_FEE,
  MERCHANT_ENS_NAME,
  MERCHANT_NAME,
  TREASURER_NAME,
  TREASURY_FNS,
  USDC_APPROVE_FN,
  buildTreasuryE2ePlan,
  createCircleClient,
  executeContract,
  formatTreasuryE2eStep,
  formatUsdc6,
  readRoster,
  resolveTreasuryAddress,
  waitComplete,
  walletFor,
  type CircleClient,
  type CircleTx,
  type TreasuryE2eSnap,
  type TreasuryE2eStep,
  type TreasuryLoanSnap,
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

const treasuryAbi = parseAbi([
  "function gracePeriodSeconds() view returns (uint32)",
  "function loanCount() view returns (uint256)",
  "function ensNameOf(address) view returns (string)",
  "function depositOf(address) view returns (uint256)",
  "function balance() view returns (uint256)",
  "function owed(uint256 loanId) view returns (uint256 principalRemaining, uint256 interestOwed)",
  "function loan(uint256 loanId) view returns ((address borrower, uint8 status, uint16 rateBps, uint32 termSeconds, uint64 requestedAt, uint64 approvedAt, uint64 lastAccrualAt, uint64 dueAt, uint256 principal, uint256 principalRemaining, uint256 interestOwed, uint256 interestPaid))",
]);

function explorerTx(hash: string): string {
  return `${ARC_EXPLORER_URL}/tx/${hash}`;
}

/** Circle SDK errors often stash `code` / `response.data`; print them, never secrets. */
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

function logHash(label: string, tx: CircleTx, txId: string): void {
  const ref = tx.txHash ? explorerTx(tx.txHash) : txId;
  console.log(`  ${label}  ${ref}`);
}

async function execFn(
  client: CircleClient,
  input: {
    walletId: string;
    contractAddress: Address;
    abiFunctionSignature: string;
    abiParameters: Array<string | number | boolean>;
    label: string;
  },
): Promise<CircleTx & { state: "COMPLETE" }> {
  try {
    const { txId } = await executeContract(client, {
      walletId: input.walletId,
      contractAddress: input.contractAddress,
      abiFunctionSignature: input.abiFunctionSignature,
      abiParameters: input.abiParameters,
      fee: DEFAULT_FEE,
      idempotencyKey: randomUUID(),
    });
    const tx = await waitComplete(client, txId);
    logHash(input.label, tx, txId);
    return tx;
  } catch (e) {
    console.error(`  ! ${input.label} failed: ${formatCircleError(e)}`);
    throw e;
  }
}

async function approveUsdc(
  client: CircleClient,
  walletId: string,
  treasury: Address,
  amountUsdc6: bigint,
  why: string,
): Promise<void> {
  await execFn(client, {
    walletId,
    contractAddress: ARC_USDC_ADDRESS,
    abiFunctionSignature: USDC_APPROVE_FN,
    abiParameters: [treasury, amountUsdc6.toString()],
    label: `approve USDC ${formatUsdc6(amountUsdc6)} (${why})`,
  });
}

async function readMerchantLoans(
  pub: PublicClient,
  treasury: Address,
  merchant: Address,
  loanCount: bigint,
): Promise<TreasuryLoanSnap[]> {
  if (loanCount === 0n) return [];
  const ids = Array.from({ length: Number(loanCount) }, (_, i) => BigInt(i + 1));
  const rows = await Promise.all(
    ids.map(async (id) => {
      const l = await pub.readContract({
        address: treasury,
        abi: treasuryAbi,
        functionName: "loan",
        args: [id],
      });
      if (l.borrower.toLowerCase() !== merchant.toLowerCase()) return undefined;
      const owed = await pub.readContract({
        address: treasury,
        abi: treasuryAbi,
        functionName: "owed",
        args: [id],
      });
      const snap: TreasuryLoanSnap = {
        id,
        borrower: getAddress(l.borrower) as Address,
        status: l.status,
        termSeconds: l.termSeconds,
        dueAt: l.dueAt,
        principal: l.principal,
        principalRemaining: owed[0],
        interestOwed: owed[1],
      };
      return snap;
    }),
  );
  return rows.filter((r): r is TreasuryLoanSnap => r !== undefined);
}

async function loadSnap(pub: PublicClient): Promise<TreasuryE2eSnap> {
  const roster = readRoster();
  const treasurerW = walletFor(roster, TREASURER_NAME);
  const merchantW = walletFor(roster, MERCHANT_NAME);
  const treasury = getAddress(resolveTreasuryAddress(process.env)) as Address;
  const merchant = getAddress(merchantW.address) as Address;
  const treasurer = getAddress(treasurerW.address) as Address;

  const [grace, loanCount, ensName, deposit6, treasuryUsdc6, merchantUsdc6, block] =
    await Promise.all([
      pub.readContract({ address: treasury, abi: treasuryAbi, functionName: "gracePeriodSeconds" }),
      pub.readContract({ address: treasury, abi: treasuryAbi, functionName: "loanCount" }),
      pub.readContract({
        address: treasury,
        abi: treasuryAbi,
        functionName: "ensNameOf",
        args: [merchant],
      }),
      pub.readContract({
        address: treasury,
        abi: treasuryAbi,
        functionName: "depositOf",
        args: [merchant],
      }),
      pub.readContract({ address: treasury, abi: treasuryAbi, functionName: "balance" }),
      pub.readContract({
        address: ARC_USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [merchant],
      }),
      pub.getBlock(),
    ]);

  const loans = await readMerchantLoans(pub, treasury, merchant, loanCount);
  return {
    treasury,
    treasuryUsdc6,
    gracePeriodSeconds: grace,
    nowSeconds: Number(block.timestamp),
    loanCount,
    merchant: {
      name: MERCHANT_NAME,
      address: merchant,
      walletId: merchantW.walletId,
      usdc6: merchantUsdc6,
      deposit6,
      ensName,
    },
    treasurer: { name: TREASURER_NAME, address: treasurer, walletId: treasurerW.walletId },
    loans,
  };
}

function printHeader(s: TreasuryE2eSnap): void {
  console.log(`treasury-e2e plan  (Arc ${ARC_TESTNET_CHAIN_ID}  treasury ${s.treasury})`);
  console.log("  Amounts are 6-dec ERC-20 base units. Circle SCA fee = DEFAULT_FEE (MEDIUM).");
  console.log("  No native 18-dec sends. Approve USDC before deposit/repay.");
  console.log(`  treasurer ada  ${s.treasurer.address}`);
  console.log(`  merchant  bo   ${s.merchant.address}  erc20 ${formatUsdc6(s.merchant.usdc6)}`);
  console.log(`  treasury       erc20 ${formatUsdc6(s.treasuryUsdc6)}`);
  console.log(
    `  depositOf(bo)  ${formatUsdc6(s.merchant.deposit6)}  ensName "${s.merchant.ensName}"`,
  );
  console.log(`  loanCount      ${s.loanCount.toString()}  merchantLoans ${s.loans.length}`);
  console.log(`  ${graceNoteLine(s)}`);
}

function graceNoteLine(s: TreasuryE2eSnap): string {
  return `grace           ${s.gracePeriodSeconds}s  (markDefault when timestamp > dueAt+grace)`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, ms));
}

async function waitGrace(
  pub: PublicClient,
  treasury: Address,
  step: Extract<TreasuryE2eStep, { kind: "wait-grace" }>,
): Promise<void> {
  const l = await pub.readContract({
    address: treasury,
    abi: treasuryAbi,
    functionName: "loan",
    args: [step.loanId],
  });
  const target = l.dueAt + BigInt(step.gracePeriodSeconds) + 1n;
  for (;;) {
    const block = await pub.getBlock();
    if (block.timestamp >= target) {
      console.log(`  wait-grace     loan ${step.loanId.toString()}  ready (ts ${block.timestamp})`);
      return;
    }
    const remaining = Number(target - block.timestamp);
    console.log(
      `  wait-grace     loan ${step.loanId.toString()}  ${remaining}s left (grace=${step.gracePeriodSeconds}s)`,
    );
    await sleep(Math.min(Math.max(remaining, 1), 5) * 1000);
  }
}

async function runStep(
  step: TreasuryE2eStep,
  client: CircleClient,
  pub: PublicClient,
  treasury: Address,
): Promise<void> {
  if (step.kind === "skip") return;
  if (step.kind === "register-agent") {
    await execFn(client, {
      walletId: step.fromWalletId,
      contractAddress: treasury,
      abiFunctionSignature: TREASURY_FNS.registerAgent,
      abiParameters: [step.agent, step.ensName],
      label: `registerAgent ${MERCHANT_ENS_NAME}`,
    });
    return;
  }
  if (step.kind === "deposit") {
    await approveUsdc(client, step.fromWalletId, step.treasury, step.amountUsdc6, "deposit");
    await execFn(client, {
      walletId: step.fromWalletId,
      contractAddress: step.treasury,
      abiFunctionSignature: TREASURY_FNS.deposit,
      abiParameters: [step.amountUsdc6.toString()],
      label: `deposit ${formatUsdc6(step.amountUsdc6)}`,
    });
    return;
  }
  if (step.kind === "request-loan") {
    await execFn(client, {
      walletId: step.fromWalletId,
      contractAddress: treasury,
      abiFunctionSignature: TREASURY_FNS.requestLoan,
      abiParameters: [step.amountUsdc6.toString(), String(step.termSeconds)],
      label: `requestLoan ${step.path} ${formatUsdc6(step.amountUsdc6)} term=${step.termSeconds}s`,
    });
    return;
  }
  if (step.kind === "approve-loan") {
    await execFn(client, {
      walletId: step.fromWalletId,
      contractAddress: treasury,
      abiFunctionSignature: TREASURY_FNS.approveLoan,
      abiParameters: [step.loanId.toString()],
      label: `approveLoan ${step.path} #${step.loanId.toString()}`,
    });
    return;
  }
  if (step.kind === "repay") {
    const owed = await pub.readContract({
      address: treasury,
      abi: treasuryAbi,
      functionName: "owed",
      args: [step.loanId],
    });
    const amount = owed[0] + owed[1];
    if (amount === 0n) throw new Error(`owed is 0 for loan ${step.loanId.toString()}`);
    await approveUsdc(client, step.fromWalletId, step.treasury, amount, "repay");
    await execFn(client, {
      walletId: step.fromWalletId,
      contractAddress: step.treasury,
      abiFunctionSignature: TREASURY_FNS.repay,
      abiParameters: [step.loanId.toString(), amount.toString()],
      label: `repay loan ${step.loanId.toString()} ${formatUsdc6(amount)}`,
    });
    return;
  }
  if (step.kind === "wait-grace") {
    await waitGrace(pub, treasury, step);
    return;
  }
  await execFn(client, {
    walletId: step.fromWalletId,
    contractAddress: treasury,
    abiFunctionSignature: TREASURY_FNS.markDefault,
    abiParameters: [step.loanId.toString()],
    label: `markDefault loan ${step.loanId.toString()}`,
  });
}

async function main(): Promise<void> {
  const pub = createPublicClient({ chain: arcTestnet, transport: http() });
  const s = await loadSnap(pub);
  const plan = buildTreasuryE2ePlan(s);

  printHeader(s);
  console.log(`  ${plan.graceNote}`);
  console.log("  steps:");
  plan.steps.forEach((st, i) =>
    console.log(`  ${String(i + 1).padStart(2)}. ${formatTreasuryE2eStep(st)}`),
  );

  if (!broadcast) {
    console.log("\nRefusing to broadcast without --yes (default is --dry-run).");
    console.log(
      "After orchestrator --yes: tx hashes for deposit, requestLoan, approveLoan, repay, markDefault.",
    );
    return;
  }

  const parsed = CircleEnvSchema.safeParse({
    CIRCLE_API_KEY: process.env.CIRCLE_API_KEY || undefined,
    CIRCLE_ENTITY_SECRET: process.env.CIRCLE_ENTITY_SECRET || undefined,
  });
  if (!parsed.success) {
    throw new Error("CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET required for --yes");
  }

  console.log("\nLIVE broadcast…");
  const client = createCircleClient(process.env);
  for (const step of plan.steps) {
    await runStep(step, client, pub, s.treasury);
  }
  console.log("\nDone. Re-check with: pnpm --filter @agent-town/circle balances");
  console.log(`  treasury ${ARC_EXPLORER_URL}/address/${s.treasury}`);
}

main().catch((e: unknown) => {
  console.error(`\ntreasury-e2e failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
