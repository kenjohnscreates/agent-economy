// M6.5 — seed a short-term Active loan for **cy** (never bo).
// Dry-run default. `--yes` + ALLOW_BROADCAST=true broadcasts via Circle SCAs.
// Term 1s + contract grace (~120s) so t7 markDefault can see an Active non-bo loan.
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import {
  ARC_EXPLORER_URL,
  ARC_RPC_URL_DEFAULT,
  ARC_TESTNET_CHAIN_ID,
} from "@agent-town/shared";
import { createPublicClient, defineChain, http, parseAbi, type Address } from "viem";
import {
  DEFAULT_FEE,
  TREASURY_FNS,
  createCircleClient,
  executeContract,
  formatUsdc6,
  readRoster,
  resolveTreasuryAddress,
  waitComplete,
  walletFor,
  type CircleClient,
} from "../src/index.js";

const BORROWER = "cy" as const;
const TREASURER = "ada" as const;
const PRINCIPAL_USDC_6 = 200_000n;
const TERM_SECONDS = 1;

const { values: flags } = parseArgs({
  options: { yes: { type: "boolean", default: false } },
  strict: true,
});

const treasuryAbi = parseAbi([
  "function gracePeriodSeconds() view returns (uint32)",
  "function loanCount() view returns (uint256)",
  "function activeLoanOf(address) view returns (uint256)",
  "function balance() view returns (uint256)",
  "function loan(uint256 loanId) view returns ((address borrower, uint8 status, uint16 rateBps, uint32 termSeconds, uint64 requestedAt, uint64 approvedAt, uint64 lastAccrualAt, uint64 dueAt, uint256 principal, uint256 principalRemaining, uint256 interestOwed, uint256 interestPaid))",
]);

const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || ARC_RPC_URL_DEFAULT] } },
});

function explorerTx(hash: string): string {
  return `${ARC_EXPLORER_URL}/tx/${hash}`;
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
): Promise<void> {
  const { txId } = await executeContract(client, {
    walletId: input.walletId,
    contractAddress: input.contractAddress,
    abiFunctionSignature: input.abiFunctionSignature,
    abiParameters: input.abiParameters,
    fee: DEFAULT_FEE,
    idempotencyKey: randomUUID(),
  });
  const tx = await waitComplete(client, txId);
  console.log(`  ${input.label}  ${tx.txHash ? explorerTx(tx.txHash) : txId}`);
}

async function main(): Promise<void> {
  const broadcast = Boolean(flags.yes) && process.env.ALLOW_BROADCAST === "true";
  const pub = createPublicClient({ chain: arcTestnet, transport: http() });
  const roster = readRoster();
  const cy = walletFor(roster, BORROWER);
  const ada = walletFor(roster, TREASURER);
  const treasury = resolveTreasuryAddress(process.env) as Address;
  const cyAddr = cy.address as Address;

  const [grace, loanCount, active, liquid] = await Promise.all([
    pub.readContract({ address: treasury, abi: treasuryAbi, functionName: "gracePeriodSeconds" }),
    pub.readContract({ address: treasury, abi: treasuryAbi, functionName: "loanCount" }),
    pub.readContract({
      address: treasury,
      abi: treasuryAbi,
      functionName: "activeLoanOf",
      args: [cyAddr],
    }),
    pub.readContract({ address: treasury, abi: treasuryAbi, functionName: "balance" }),
  ]);

  console.log(`seed-cy-loan  treasury ${treasury}`);
  console.log(`  cy           ${cy.address}`);
  console.log(`  loanCount    ${loanCount}  activeLoanOf(cy)=${active}`);
  console.log(`  balance      ${formatUsdc6(liquid)}  grace ${grace}s  term ${TERM_SECONDS}s`);
  console.log(`  principal    ${formatUsdc6(PRINCIPAL_USDC_6)}`);
  console.log(`  broadcast    ${broadcast ? "YES" : "dry-run"}`);

  if (active !== 0n) {
    const row = await pub.readContract({
      address: treasury,
      abi: treasuryAbi,
      functionName: "loan",
      args: [active],
    });
    console.log(`  existing     loan ${active} status=${row.status} dueAt=${row.dueAt}`);
    if (row.status === 2) {
      console.log("  skip         cy already has an Active loan");
      return;
    }
    if (row.status === 1) {
      console.log("  next         approveLoan on existing Pending");
      if (!broadcast) return;
      await execFn(createCircleClient(process.env), {
        walletId: ada.walletId,
        contractAddress: treasury,
        abiFunctionSignature: TREASURY_FNS.approveLoan,
        abiParameters: [active.toString()],
        label: `approveLoan ${active}`,
      });
      return;
    }
    throw new Error(`cy activeLoanOf=${active} status=${row.status} — not Pending/Active`);
  }

  if (liquid < PRINCIPAL_USDC_6) {
    throw new Error(`treasury balance ${liquid} < principal ${PRINCIPAL_USDC_6}`);
  }

  if (!broadcast) {
    console.log("  plan         requestLoan(cy) then approveLoan(ada) → wait grace then sim --yes");
    return;
  }

  const client = createCircleClient(process.env);
  await execFn(client, {
    walletId: cy.walletId,
    contractAddress: treasury,
    abiFunctionSignature: TREASURY_FNS.requestLoan,
    abiParameters: [PRINCIPAL_USDC_6.toString(), TERM_SECONDS],
    label: "requestLoan cy 0.20",
  });
  const newId = await pub.readContract({
    address: treasury,
    abi: treasuryAbi,
    functionName: "activeLoanOf",
    args: [cyAddr],
  });
  if (newId === 0n) throw new Error("requestLoan did not set activeLoanOf(cy)");
  await execFn(client, {
    walletId: ada.walletId,
    contractAddress: treasury,
    abiFunctionSignature: TREASURY_FNS.approveLoan,
    abiParameters: [newId.toString()],
    label: `approveLoan ${newId}`,
  });
  console.log(`  seeded       loan ${newId}  wait ${Number(grace) + TERM_SECONDS + 1}s then live 12-tick`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
