// M1.4 — fund mayor, fan-out USDC to 8 agents, TownTreasury.fund().
// Inputs: roster.json, TOWN_TREASURY_ADDRESS / deployments/arc-testnet.json, DEPLOYER_PRIVATE_KEY,
//   CIRCLE_* (for mayor transferUsdc + treasurer executeContract). Amounts are 6-dec strings.
// Outputs: dry-run plan (default) or broadcast txs (--yes). Idempotent. Never logs secrets.
// Usage: pnpm --filter @agent-town/circle fund
//        pnpm --filter @agent-town/circle fund --yes
import { parseArgs } from "node:util";
import {
  ARC_EXPLORER_URL,
  ARC_RPC_URL_DEFAULT,
  ARC_TESTNET_CHAIN_ID,
  ARC_USDC_ADDRESS,
} from "@agent-town/shared";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  erc20Abi,
  getAddress,
  http,
  parseAbi,
  parseGwei,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  CircleEnvSchema,
  TREASURER_NAME,
  absoluteFee,
  buildFundPlan,
  createCircleClient,
  executeContract,
  formatStep,
  formatUsdc6,
  gapUsdc6,
  nativeToDecimalString,
  readRoster,
  requestCircleFaucet,
  resolveTreasuryAddress,
  snapsFromRoster,
  transferUsdc,
  usdc6ToNative18,
  waitComplete,
  type FundStep,
  type FundWalletSnap,
} from "../src/index.js";

const { values: flags } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
  },
  strict: true,
});

const broadcast = Boolean(flags.yes) && !flags["dry-run"];

const treasuryAbi = parseAbi(["function fund(uint256 amount)"]);
const ARC_MIN_FEE = parseGwei("20");
const ARC_TIP = parseGwei("1");

const arcTestnet: Chain = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || ARC_RPC_URL_DEFAULT] } },
});

function pkFromEnv(raw: string | undefined): Hex {
  if (!raw) throw new Error("DEPLOYER_PRIVATE_KEY is required for --yes");
  const hex = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("DEPLOYER_PRIVATE_KEY must be 32-byte hex (with or without 0x)");
  }
  return hex;
}

function rosterSnaps(): Omit<FundWalletSnap, "usdc6" | "native18">[] {
  const roster = readRoster();
  if (roster.wallets.length === 0) {
    console.warn("  ! roster.json empty — using live M1.3 addresses (no Circle wallet ids).");
  }
  return snapsFromRoster(roster);
}

async function readUsdc6(pub: PublicClient, address: Address): Promise<bigint> {
  return pub.readContract({
    address: ARC_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
}

async function loadSnaps(
  pub: PublicClient,
  base: Omit<FundWalletSnap, "usdc6" | "native18">[],
): Promise<FundWalletSnap[]> {
  const out: FundWalletSnap[] = [];
  for (const b of base) {
    const addr = getAddress(b.address) as Address;
    const [usdc6, native18] = await Promise.all([
      readUsdc6(pub, addr),
      pub.getBalance({ address: addr }),
    ]);
    out.push({ ...b, address: addr, usdc6, native18 });
  }
  return out;
}

async function fees(pub: PublicClient): Promise<{
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}> {
  const est = await pub.estimateFeesPerGas().catch(() => undefined);
  const maxFeePerGas = est?.maxFeePerGas && est.maxFeePerGas > ARC_MIN_FEE ? est.maxFeePerGas : ARC_MIN_FEE;
  const maxPriorityFeePerGas =
    est?.maxPriorityFeePerGas && est.maxPriorityFeePerGas > 0n ? est.maxPriorityFeePerGas : ARC_TIP;
  return { maxFeePerGas, maxPriorityFeePerGas };
}

function explorerTx(hash: string): string {
  return `${ARC_EXPLORER_URL}/tx/${hash}`;
}

function printHeader(input: {
  treasury: Address;
  deployer?: Address;
  deployerNative18: bigint;
  deployerUsdc6: bigint;
  treasuryUsdc6: bigint;
  snaps: FundWalletSnap[];
}): void {
  console.log(`fund plan  (Arc ${ARC_TESTNET_CHAIN_ID}  treasury ${input.treasury})`);
  console.log("  Amounts below are 6-dec ERC-20 base units unless marked wei/18-dec.");
  console.log("  Native send ×1e12 = same USDC as ERC-20; do not add the two views together.");
  if (input.deployer) {
    console.log(`  deployer EOA   ${input.deployer}`);
    console.log(
      `  deployer       erc20 ${formatUsdc6(input.deployerUsdc6)}  native ${nativeToDecimalString(input.deployerNative18)} (${input.deployerNative18.toString()} wei)`,
    );
  } else {
    console.log("  deployer       (DEPLOYER_PRIVATE_KEY unset — dry-run ok)");
  }
  console.log(`  treasury       erc20 ${formatUsdc6(input.treasuryUsdc6)}`);
  for (const w of input.snaps) {
    console.log(
      `  ${w.name.padEnd(7)} ${w.address}  erc20 ${formatUsdc6(w.usdc6)}  native ${nativeToDecimalString(w.native18)}`,
    );
  }
}

async function runFaucet(step: Extract<FundStep, { kind: "faucet" }>): Promise<void> {
  const key = process.env.CIRCLE_API_KEY;
  if (!key) {
    console.log("  faucet skipped (no CIRCLE_API_KEY) — deployer path will fill the gap.");
    return;
  }
  const r = await requestCircleFaucet({ apiKey: key, address: step.to });
  console.log(`  faucet ${r.ok ? "ok" : "skip"}  HTTP ${r.status}  ${r.detail}`);
}

async function runDeployerNative(
  step: Extract<FundStep, { kind: "deployer-native" }>,
  pub: PublicClient,
  wallet: WalletClient,
  account: Account,
): Promise<void> {
  const current = await readUsdc6(pub, step.to);
  const send6 = gapUsdc6(current, step.targetUsdc6);
  if (send6 === 0n) {
    console.log(`  skip ${step.toName}: already ${current.toString()} base`);
    return;
  }
  const value = usdc6ToNative18(send6);
  const fee = await fees(pub);
  const hash = await wallet.sendTransaction({
    account,
    chain: arcTestnet,
    to: step.to,
    value,
    maxFeePerGas: fee.maxFeePerGas,
    maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
  });
  await pub.waitForTransactionReceipt({ hash });
  console.log(`  native→${step.toName}  ${formatUsdc6(send6)}  ${explorerTx(hash)}`);
}

async function runCircleTransfer(
  step: Extract<FundStep, { kind: "circle-transfer" }>,
  pub: PublicClient,
): Promise<boolean> {
  const current = await readUsdc6(pub, step.to);
  const send6 = gapUsdc6(current, step.targetUsdc6);
  if (send6 === 0n) {
    console.log(`  skip ${step.toName}: already ${current.toString()} base`);
    return true;
  }
  const env = process.env;
  const parsed = CircleEnvSchema.safeParse({
    CIRCLE_API_KEY: env.CIRCLE_API_KEY || undefined,
    CIRCLE_ENTITY_SECRET: env.CIRCLE_ENTITY_SECRET || undefined,
  });
  if (!parsed.success) return false;
  const client = createCircleClient(env);
  const { txId } = await transferUsdc(client, {
    walletId: step.fromWalletId,
    to: step.to,
    amountUsdc: send6.toString(),
    fee: absoluteFee({ gasLimit: 100_000n }),
    idempotencyKey: `m1.4-xfer-${step.toName}-${send6.toString()}`,
  });
  const tx = await waitComplete(client, txId);
  console.log(
    `  circle ${step.fromName}→${step.toName}  ${formatUsdc6(send6)}  ${tx.txHash ? explorerTx(tx.txHash) : txId}`,
  );
  return true;
}

async function runCircleFund(
  step: Extract<FundStep, { kind: "circle-fund" }>,
  pub: PublicClient,
): Promise<boolean> {
  const treasuryBal = await readUsdc6(pub, step.treasury);
  if (treasuryBal >= step.amountUsdc6) {
    console.log(`  skip treasury: already ${treasuryBal.toString()} base`);
    return true;
  }
  const env = process.env;
  const parsed = CircleEnvSchema.safeParse({
    CIRCLE_API_KEY: env.CIRCLE_API_KEY || undefined,
    CIRCLE_ENTITY_SECRET: env.CIRCLE_ENTITY_SECRET || undefined,
  });
  if (!parsed.success) return false;
  const client = createCircleClient(env);
  const amt = step.amountUsdc6.toString();
  const approve = await executeContract(client, {
    walletId: step.fromWalletId,
    contractAddress: ARC_USDC_ADDRESS,
    abiFunctionSignature: "approve(address,uint256)",
    abiParameters: [step.treasury, amt],
    fee: absoluteFee({ gasLimit: 80_000n }),
    idempotencyKey: `m1.4-approve-${TREASURER_NAME}-${amt}`,
  });
  const approveTx = await waitComplete(client, approve.txId);
  console.log(`  circle approve  ${amt}  ${approveTx.txHash ? explorerTx(approveTx.txHash) : approve.txId}`);
  const fund = await executeContract(client, {
    walletId: step.fromWalletId,
    contractAddress: step.treasury,
    abiFunctionSignature: "fund(uint256)",
    abiParameters: [amt],
    fee: absoluteFee({ gasLimit: 120_000n }),
    idempotencyKey: `m1.4-fund-${TREASURER_NAME}-${amt}`,
  });
  const fundTx = await waitComplete(client, fund.txId);
  console.log(`  circle fund()   ${amt}  ${fundTx.txHash ? explorerTx(fundTx.txHash) : fund.txId}`);
  return true;
}

async function runDeployerFund(
  step: Extract<FundStep, { kind: "deployer-fund" }>,
  pub: PublicClient,
  wallet: WalletClient,
  account: Account,
): Promise<void> {
  const treasuryBal = await readUsdc6(pub, step.treasury);
  if (treasuryBal >= step.amountUsdc6) {
    console.log(`  skip treasury: already ${treasuryBal.toString()} base`);
    return;
  }
  const fee = await fees(pub);
  const common = {
    account,
    chain: arcTestnet,
    maxFeePerGas: fee.maxFeePerGas,
    maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
  } as const;
  const approveHash = await wallet.writeContract({
    ...common,
    address: ARC_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "approve",
    args: [step.treasury, step.amountUsdc6],
  });
  await pub.waitForTransactionReceipt({ hash: approveHash });
  console.log(`  deployer approve  ${formatUsdc6(step.amountUsdc6)}  ${explorerTx(approveHash)}`);
  const fundHash = await wallet.writeContract({
    ...common,
    address: step.treasury,
    abi: treasuryAbi,
    functionName: "fund",
    args: [step.amountUsdc6],
  });
  await pub.waitForTransactionReceipt({ hash: fundHash });
  console.log(`  deployer fund()   ${formatUsdc6(step.amountUsdc6)}  ${explorerTx(fundHash)}`);
}

async function executeSteps(
  steps: FundStep[],
  pub: PublicClient,
  wallet: WalletClient | undefined,
  account: Account | undefined,
): Promise<void> {
  const needDeployer = (s: FundStep) => s.kind === "deployer-native" || s.kind === "deployer-fund";
  for (const step of steps) {
    if (step.kind === "skip") continue;
    if (needDeployer(step) && (!wallet || !account)) {
      throw new Error("DEPLOYER_PRIVATE_KEY required for deployer steps");
    }
    if (step.kind === "faucet") {
      await runFaucet(step);
      continue;
    }
    if (step.kind === "deployer-native" && wallet && account) {
      await runDeployerNative(step, pub, wallet, account);
      continue;
    }
    if (step.kind === "circle-transfer") {
      const ok = await runCircleTransfer(step, pub);
      if (!ok && wallet && account) {
        console.log(`  ! Circle transfer unavailable — deployer native to ${step.toName}`);
        await runDeployerNative(
          {
            kind: "deployer-native",
            toName: step.toName,
            to: step.to,
            targetUsdc6: step.targetUsdc6,
            why: "fallback",
          },
          pub,
          wallet,
          account,
        );
      } else if (!ok) {
        throw new Error(`Circle transfer to ${step.toName} needs CIRCLE_* or DEPLOYER_PRIVATE_KEY`);
      }
      continue;
    }
    if (step.kind === "circle-fund") {
      const ok = await runCircleFund(step, pub);
      if (!ok && wallet && account) {
        console.log("  ! Circle fund unavailable — deployer fund()");
        await runDeployerFund(
          { kind: "deployer-fund", treasury: step.treasury, amountUsdc6: step.amountUsdc6 },
          pub,
          wallet,
          account,
        );
      } else if (!ok) {
        throw new Error("Circle fund() needs CIRCLE_* or DEPLOYER_PRIVATE_KEY");
      }
      continue;
    }
    if (step.kind === "deployer-fund" && wallet && account) {
      await runDeployerFund(step, pub, wallet, account);
    }
  }
}

async function main(): Promise<void> {
  const treasury = resolveTreasuryAddress(process.env);
  const pub = createPublicClient({ chain: arcTestnet, transport: http() });
  const base = rosterSnaps();
  const snaps = await loadSnaps(pub, base);
  const treasuryUsdc6 = await readUsdc6(pub, getAddress(treasury) as Address);

  let deployerAddr: Address | undefined;
  let deployerNative18 = 0n;
  let deployerUsdc6 = 0n;
  const pkRaw = process.env.DEPLOYER_PRIVATE_KEY;
  if (pkRaw) {
    const account = privateKeyToAccount(pkFromEnv(pkRaw));
    deployerAddr = account.address;
    deployerNative18 = await pub.getBalance({ address: account.address });
    deployerUsdc6 = await readUsdc6(pub, account.address);
  }

  const preferCircle = snaps.every((w) => Boolean(w.walletId));
  const plan = buildFundPlan({
    wallets: snaps,
    treasuryUsdc6,
    treasury: getAddress(treasury) as Address,
    preferCircle,
  });

  printHeader({
    treasury: getAddress(treasury) as Address,
    deployer: deployerAddr,
    deployerNative18,
    deployerUsdc6,
    treasuryUsdc6,
    snaps,
  });
  console.log(`  preferCircle   ${plan.preferCircle}  mayorTarget ${formatUsdc6(plan.mayorTarget6)}`);
  console.log("  steps:");
  plan.steps.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${formatStep(s)}`));

  if (!broadcast) {
    console.log("\nRefusing to broadcast without --yes (default is --dry-run).");
    console.log("After --yes: pnpm --filter @agent-town/circle balances");
    return;
  }

  const needDeployer = plan.steps.some(
    (s) => s.kind === "deployer-native" || s.kind === "deployer-fund" || s.kind === "circle-transfer" || s.kind === "circle-fund",
  );
  let account: Account | undefined;
  let wallet: WalletClient | undefined;
  if (pkRaw) {
    account = privateKeyToAccount(pkFromEnv(pkRaw));
    wallet = createWalletClient({ account, chain: arcTestnet, transport: http() });
  } else if (needDeployer) {
    throw new Error("DEPLOYER_PRIVATE_KEY is required for --yes");
  }

  console.log("\nLIVE broadcast…");
  await executeSteps(plan.steps, pub, wallet, account);
  console.log("\nDone. Re-check with: pnpm --filter @agent-town/circle balances");
  console.log(`  agents  ${ARC_EXPLORER_URL}/address/<agent>  (erc20 > 0, native > 0)`);
  console.log(`  treasury ${ARC_EXPLORER_URL}/address/${treasury}`);
}

main().catch((e: unknown) => {
  console.error(`\nfund failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
