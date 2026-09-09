// Mayor POST handlers — Circle SCA txs, gated by ALLOW_BROADCAST (default dry-run).
import { randomUUID } from "node:crypto";
import {
  ARC_EXPLORER_URL,
  ARC_USDC_ADDRESS,
  type Address,
  type MayorFundRequest,
  type MayorLoanDecisionRequest,
  type MayorRateRequest,
  type TxResponse,
} from "@agent-town/shared";
import {
  DEFAULT_FEE,
  TREASURER_NAME,
  executeContract,
  resolveTreasuryAddress,
  waitComplete,
  type CircleClient,
} from "@agent-town/circle";
import { SourceError } from "../source.js";

const TREASURY_FNS = {
  fund: "fund(uint256)",
  approveLoan: "approveLoan(uint256)",
  denyLoan: "denyLoan(uint256)",
  setBaseRateBps: "setBaseRateBps(uint16)",
} as const;

const USDC_APPROVE_FN = "approve(address,uint256)";

export interface MayorDeps {
  circle: CircleClient;
  mayorWalletId: string;
  treasurerWalletId: string;
  treasuryAddress?: Address;
  broadcastAllowed: boolean;
}

function requireBroadcast(allowed: boolean): void {
  if (!allowed) {
    throw new SourceError(
      501,
      "NOT_IMPLEMENTED",
      "Mayor transactions require ALLOW_BROADCAST=true",
    );
  }
}

function explorerTxUrl(hash: string): string {
  return `${ARC_EXPLORER_URL}/tx/${hash}`;
}

function parseLoanId(raw: string): string {
  const digits = raw.match(/\d+/)?.[0];
  if (!digits) throw new SourceError(400, "BAD_REQUEST", `Invalid loanId: ${raw}`);
  return digits;
}

async function submitAndWait(
  deps: MayorDeps,
  input: {
    walletId: string;
    contractAddress: string;
    abiFunctionSignature: string;
    abiParameters: Array<string | number | boolean>;
  },
): Promise<TxResponse> {
  const { txId } = await executeContract(deps.circle, {
    walletId: input.walletId,
    contractAddress: input.contractAddress,
    abiFunctionSignature: input.abiFunctionSignature,
    abiParameters: input.abiParameters,
    fee: DEFAULT_FEE,
    idempotencyKey: randomUUID(),
  });
  const done = await waitComplete(deps.circle, txId);
  const hash = done.txHash;
  if (!hash) throw new Error(`Circle tx ${txId} completed without on-chain hash`);
  return { txHash: hash as `0x${string}`, explorerUrl: explorerTxUrl(hash) };
}

export async function mayorFund(deps: MayorDeps, body: MayorFundRequest): Promise<TxResponse> {
  requireBroadcast(deps.broadcastAllowed);
  const treasury = deps.treasuryAddress ?? resolveTreasuryAddress();
  const amount = body.amountUsdc;
  await submitAndWait(deps, {
    walletId: deps.mayorWalletId,
    contractAddress: ARC_USDC_ADDRESS,
    abiFunctionSignature: USDC_APPROVE_FN,
    abiParameters: [treasury, amount],
  });
  return submitAndWait(deps, {
    walletId: deps.mayorWalletId,
    contractAddress: treasury,
    abiFunctionSignature: TREASURY_FNS.fund,
    abiParameters: [amount],
  });
}

export async function mayorLoanDecision(
  deps: MayorDeps,
  body: MayorLoanDecisionRequest,
): Promise<TxResponse> {
  requireBroadcast(deps.broadcastAllowed);
  const treasury = deps.treasuryAddress ?? resolveTreasuryAddress();
  const loanId = parseLoanId(body.loanId);
  return submitAndWait(deps, {
    walletId: deps.treasurerWalletId,
    contractAddress: treasury,
    abiFunctionSignature: body.approve ? TREASURY_FNS.approveLoan : TREASURY_FNS.denyLoan,
    abiParameters: [loanId],
  });
}

export async function mayorRate(deps: MayorDeps, body: MayorRateRequest): Promise<TxResponse> {
  requireBroadcast(deps.broadcastAllowed);
  const treasury = deps.treasuryAddress ?? resolveTreasuryAddress();
  return submitAndWait(deps, {
    walletId: deps.treasurerWalletId,
    contractAddress: treasury,
    abiFunctionSignature: TREASURY_FNS.setBaseRateBps,
    abiParameters: [body.bps],
  });
}

export function defaultMayorWalletIds(roster: {
  wallets: Array<{ name: string; walletId: string }>;
}): { mayorWalletId: string; treasurerWalletId: string } {
  const mayor = roster.wallets.find((w) => w.name === "mayor");
  const treasurer = roster.wallets.find((w) => w.name === TREASURER_NAME);
  if (!mayor?.walletId || !treasurer?.walletId) {
    throw new Error("roster.json missing mayor or treasurer wallet ids");
  }
  return { mayorWalletId: mayor.walletId, treasurerWalletId: treasurer.walletId };
}
