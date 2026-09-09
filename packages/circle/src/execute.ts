// Transaction execution + polling. Inputs: injected `CircleClient`, wallet ids,
// base-unit amounts. Outputs: `{txId}` handles, terminal `CircleTx`, or thrown
// `CircleTxFailed` / `CircleTxTimeout` (failures surfaced, never swallowed —
// AGENT-RUNBOOK §4). Callers (sim tick) submit in parallel and poll async (§6.1).
// SDK methods: createContractExecutionTransaction, createTransaction (transfer),
// getTransaction. https://developers.circle.com/wallets/dev-controlled/transfer-tokens-across-wallets
// https://developers.circle.com/wallets/dev-controlled/interact-with-smart-contracts
import { ARC_USDC_ADDRESS } from "@agent-town/shared";
import type { FeeConfiguration } from "@circle-fin/developer-controlled-wallets";
import { toUsdcDecimalString } from "./amounts.js";
import type { CircleClient, CircleTx, TxState } from "./client.js";

export type FeeLevel = "LOW" | "MEDIUM" | "HIGH";
export type Fee = FeeConfiguration<FeeLevel>;

/** Arc rejects (silently drops) txs with maxFeePerGas < 20 gwei — docs.arc.io/arc/references/gas-and-fees */
export const ARC_MIN_MAX_FEE_GWEI = 20n;

export const DEFAULT_FEE: Fee = { type: "level", config: { feeLevel: "MEDIUM" } };

/** Absolute EVM fee (gwei strings per Circle docs); clamps maxFee to the Arc 20 gwei floor. */
export function absoluteFee(input: {
  gasLimit: string | bigint;
  maxFeeGwei?: string | bigint;
  priorityFeeGwei?: string | bigint;
}): Fee {
  const max = BigInt(input.maxFeeGwei ?? ARC_MIN_MAX_FEE_GWEI);
  const clamped = max < ARC_MIN_MAX_FEE_GWEI ? ARC_MIN_MAX_FEE_GWEI : max;
  return {
    type: "absolute",
    config: {
      gasLimit: BigInt(input.gasLimit).toString(),
      maxFee: clamped.toString(),
      priorityFee: BigInt(input.priorityFeeGwei ?? 1n).toString(),
    },
  };
}

// ─── Errors ─────────────────────────────────────────────────────────────────────

export const TERMINAL_FAILURE_STATES = ["FAILED", "DENIED", "CANCELLED", "STUCK"] as const;
export type TerminalFailureState = (typeof TERMINAL_FAILURE_STATES)[number];

export class CircleTxFailed extends Error {
  readonly txId: string;
  readonly state: string;
  readonly reason?: string;
  readonly details?: string;
  readonly txHash?: string;
  constructor(tx: CircleTx) {
    super(
      `Circle tx ${tx.id} ${tx.state}${tx.errorReason ? `: ${tx.errorReason}` : ""}${
        tx.errorDetails ? ` (${tx.errorDetails})` : ""
      }`,
    );
    this.name = "CircleTxFailed";
    this.txId = tx.id;
    this.state = tx.state;
    this.reason = tx.errorReason;
    this.details = tx.errorDetails;
    this.txHash = tx.txHash;
  }
}

export class CircleTxTimeout extends Error {
  readonly txId: string;
  readonly lastState?: string;
  constructor(txId: string, timeoutMs: number, lastState?: string) {
    super(
      `Circle tx ${txId} not terminal after ${timeoutMs}ms (last state: ${lastState ?? "unknown"})`,
    );
    this.name = "CircleTxTimeout";
    this.txId = txId;
    this.lastState = lastState;
  }
}

// ─── Submit ─────────────────────────────────────────────────────────────────────

export interface ExecuteContractInput {
  walletId: string;
  contractAddress: string;
  /** e.g. "requestLoan(uint256)" */
  abiFunctionSignature: string;
  /** Base-unit strings for uint256 (never JS numbers > 2^53). */
  abiParameters: Array<string | number | boolean | Array<string | number | boolean>>;
  /** Native value to send, 18-dec decimal string — almost never needed on Arc; default none. */
  amount?: string;
  fee?: Fee;
  refId?: string;
  idempotencyKey?: string;
}

/** Submit a contract call from an agent wallet; returns immediately with the Circle tx id. */
export async function executeContract(
  client: CircleClient,
  input: ExecuteContractInput,
): Promise<{ txId: string; state: string }> {
  const res = await client.createContractExecutionTransaction({
    walletId: input.walletId,
    contractAddress: input.contractAddress,
    abiFunctionSignature: input.abiFunctionSignature,
    abiParameters: input.abiParameters,
    ...(input.amount ? { amount: input.amount } : {}),
    fee: input.fee ?? DEFAULT_FEE,
    ...(input.refId ? { refId: input.refId } : {}),
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  });
  const id = res.data?.id;
  if (!id) throw new Error("createContractExecutionTransaction returned no tx id");
  return { txId: id, state: res.data?.state ?? "INITIATED" };
}

export interface TransferUsdcInput {
  walletId: string;
  to: string;
  /** USDC amount in 6-dec base units, e.g. "3000000" = 3 USDC. */
  amountUsdc: string;
  fee?: Fee;
  refId?: string;
  idempotencyKey?: string;
}

/**
 * ERC-20 USDC transfer via Circle `createTransaction`. Token resolved by
 * `tokenAddress` (0x3600…, 6 dec); the chain comes from `walletId` (SDK type
 * forbids `blockchain` alongside `walletId`) — no tokenId lookup needed.
 * Circle takes a *decimal* amount ("3"), so we convert from base units here.
 */
export async function transferUsdc(
  client: CircleClient,
  input: TransferUsdcInput,
): Promise<{ txId: string; state: string }> {
  const res = await client.createTransaction({
    walletId: input.walletId,
    tokenAddress: ARC_USDC_ADDRESS,
    destinationAddress: input.to,
    amount: [toUsdcDecimalString(input.amountUsdc)],
    fee: input.fee ?? DEFAULT_FEE,
    ...(input.refId ? { refId: input.refId } : {}),
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  });
  const id = res.data?.id;
  if (!id) throw new Error("createTransaction returned no tx id");
  return { txId: id, state: res.data?.state ?? "INITIATED" };
}

// ─── Poll ───────────────────────────────────────────────────────────────────────

export interface WaitOptions {
  timeoutMs?: number;
  pollMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function isTerminalFailure(state: string): state is TerminalFailureState {
  return (TERMINAL_FAILURE_STATES as readonly string[]).includes(state);
}

/**
 * Poll `getTransaction` until COMPLETE (returns the tx) or a terminal failure
 * (throws `CircleTxFailed` with state + errorReason). Throws `CircleTxTimeout`
 * after `timeoutMs` (default 120 s; SCA txs on Arc usually land in < 10 s).
 * Success pipeline: INITIATED → CLEARED → QUEUED → SENT → CONFIRMED → COMPLETE.
 */
export async function waitComplete(
  client: CircleClient,
  txId: string,
  opts: WaitOptions = {},
): Promise<CircleTx & { state: "COMPLETE" }> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const pollMs = opts.pollMs ?? 2_000;
  const sleep = opts.sleep ?? realSleep;
  const now = opts.now ?? Date.now;
  const start = now();
  let last: TxState | string | undefined;
  for (;;) {
    const res = await client.getTransaction({ id: txId });
    const tx = res.data?.transaction;
    if (tx) {
      last = tx.state;
      if (tx.state === "COMPLETE") return { ...tx, state: "COMPLETE" };
      if (isTerminalFailure(tx.state)) throw new CircleTxFailed(tx);
    }
    if (now() - start >= timeoutMs) throw new CircleTxTimeout(txId, timeoutMs, last);
    await sleep(pollMs);
  }
}

/** On-chain hash for a Circle tx id (SCA: populated from CONFIRMED onward); undefined if not yet. */
export async function getTxHash(client: CircleClient, txId: string): Promise<string | undefined> {
  const res = await client.getTransaction({ id: txId });
  return res.data?.transaction?.txHash;
}
