// M9.1 — GatewayWallet.deposit from gus ETH-SEPOLIA SCA, then optional Arc mint.
// Usage:
//   pnpm --filter @agent-town/circle gateway-deposit
//   pnpm --filter @agent-town/circle gateway-deposit --yes
//   pnpm --filter @agent-town/circle gateway-deposit --yes --transfer
// Requires gateway-gus.json (setup-gateway-gus --yes) + funded Sepolia USDC + native ETH.
// Approve + deposit(token, amount) — NEVER a plain ERC-20 transfer to GatewayWallet.
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { SEPOLIA_CHAIN_ID } from "@agent-town/shared";
import { createPublicClient, defineChain, http } from "viem";
import {
  DEFAULT_GATEWAY_GUS_PATH,
  GATEWAY_DEPOSIT_USDC_6,
  GATEWAY_TRANSFER_USDC_6,
  SEPOLIA_GATEWAY_CONFIRMATIONS,
  SEPOLIA_USDC_ADDRESS,
  buildGatewayDepositPlan,
  createCircleClient,
  defaultGatewayRecipient,
  executeGatewayDeposit,
  formatGatewayDepositPlan,
  fromUsdcDecimalString,
  gatewayWantsLive,
  parseCircleEnv,
  readGatewayGus,
  submitGatewayForwardingTransfer,
  waitSepoliaConfirmations,
  writeGatewayGus,
  type Logger,
} from "../src/index.js";

const { values: flags } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    "dry-run": { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
    transfer: { type: "boolean", default: false },
  },
  strict: true,
});

const log: Logger = {
  info: (m) => console.log(`  ${m}`),
  warn: (m) => console.warn(`  ! ${m}`),
};

function sepoliaRpc(): string {
  return process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
}

async function main() {
  const artifact = readGatewayGus();
  const plan = buildGatewayDepositPlan(GATEWAY_DEPOSIT_USDC_6);
  console.log(formatGatewayDepositPlan(plan));
  console.log(`  artifact      : ${DEFAULT_GATEWAY_GUS_PATH}`);
  console.log(
    `  gus sepolia   : ${artifact ? `${artifact.address}  ${artifact.walletId}` : "MISSING — run setup-gateway-gus --yes"}`,
  );
  console.log(`  transfer      : ${flags.transfer ? "yes (after 65-block wait)" : "no (pass --transfer)"}`);

  if (!gatewayWantsLive({ yes: flags.yes, dryRun: flags["dry-run"] })) {
    console.log("\nRefusing to broadcast without --yes (default is --dry-run).");
    return;
  }
  if (!artifact) throw new Error("gateway-gus.json missing — run setup-gateway-gus --yes first");
  if (artifact.faucet && !artifact.faucet.ok) {
    console.log(`\nBLOCKED: faucet — last drip ${artifact.faucet.status} ${artifact.faucet.detail}`);
    return;
  }

  const env = parseCircleEnv(process.env);
  const client = createCircleClient(env);
  const sepoliaChain = defineChain({
    id: SEPOLIA_CHAIN_ID,
    name: "Ethereum Sepolia",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [sepoliaRpc()] } },
  });
  const pub = createPublicClient({
    chain: sepoliaChain,
    transport: http(sepoliaRpc()),
  });

  const bal = await client.getWalletTokenBalance({
    id: artifact.walletId,
    tokenAddresses: [SEPOLIA_USDC_ADDRESS],
  });
  const usdc = bal.data?.tokenBalances?.find(
    (b) => b.token.tokenAddress?.toLowerCase() === SEPOLIA_USDC_ADDRESS.toLowerCase(),
  );
  const usdc6 = BigInt(fromUsdcDecimalString(usdc?.amount ?? "0"));
  console.log(`  wallet USDC-6 : ${usdc6}`);
  if (usdc6 < GATEWAY_DEPOSIT_USDC_6) {
    console.log("\nBLOCKED: faucet — Sepolia USDC balance below deposit amount. Do not grind.");
    return;
  }

  if (artifact.deposit?.depositTxHash) {
    console.log(`  deposit already recorded ${artifact.deposit.depositTxHash} — skip create`);
  } else {
    console.log("\nLIVE approve + GatewayWallet.deposit from SCA…");
    const dep = await executeGatewayDeposit(client, {
      walletId: artifact.walletId,
      amountUsdc6: GATEWAY_DEPOSIT_USDC_6,
      log,
      wait: { timeoutMs: 300_000, pollMs: 3_000 },
    });
    writeGatewayGus({
      ...artifact,
      deposit: {
        amountUsdc6: dep.amountUsdc6,
        approveTxId: dep.approveTxId,
        approveTxHash: dep.approveTxHash,
        depositTxId: dep.depositTxId,
        depositTxHash: dep.depositTxHash,
      },
    });
    Object.assign(artifact, {
      deposit: {
        amountUsdc6: dep.amountUsdc6,
        approveTxId: dep.approveTxId,
        approveTxHash: dep.approveTxHash,
        depositTxId: dep.depositTxId,
        depositTxHash: dep.depositTxHash,
      },
    });
    console.log(`  approve tx    : ${dep.approveTxHash ?? dep.approveTxId}`);
    console.log(`  deposit tx    : ${dep.depositTxHash ?? dep.depositTxId}`);
  }

  const depositHash = artifact.deposit?.depositTxHash;
  if (depositHash && depositHash.startsWith("0x")) {
    console.log(`\nWaiting ${SEPOLIA_GATEWAY_CONFIRMATIONS} Sepolia blocks after deposit…`);
    const receipt = await pub.waitForTransactionReceipt({ hash: depositHash as `0x${string}` });
    const waited = await waitSepoliaConfirmations({
      fromBlock: receipt.blockNumber,
      getBlockNumber: () => pub.getBlockNumber(),
    });
    console.log(`  from block ${waited.fromBlock} now ${waited.current}`);
  }

  if (!flags.transfer) {
    console.log("\nDeposit submitted. Re-run with --transfer after confirmations to mint on Arc.");
    return;
  }

  const recipient = defaultGatewayRecipient();
  console.log(`\nGateway forwarding transfer → Arc TownTreasury ${recipient}`);
  const result = await submitGatewayForwardingTransfer({
    client,
    walletId: artifact.walletId,
    depositor: artifact.address,
    recipient,
    valueUsdc6: GATEWAY_TRANSFER_USDC_6,
    salt: `0x${randomBytes(32).toString("hex")}`,
    log,
  });
  writeGatewayGus({
    ...readGatewayGus()!,
    transfer: {
      recipient,
      amountUsdc6: GATEWAY_TRANSFER_USDC_6.toString(),
      transferId: result.transferId || undefined,
      mintTxHash: result.mintTxHash,
      blocked: result.blocked,
    },
  });
  if (result.blocked) {
    console.log(`\nBLOCKED: gateway-transfer — ${result.blocked}`);
    console.log("Deposit still counts; inbound UI left as TODO (no BankPanel rewrite).");
    return;
  }
  console.log(`  transferId    : ${result.transferId}`);
  if (result.mintTxHash) console.log(`  mint tx       : ${result.mintTxHash}`);
}

main().catch((e: unknown) => {
  console.error(`\ngateway-deposit failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
