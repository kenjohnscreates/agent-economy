// M4.3 — map ProposedAction → Circle tx via packages/circle (dry-run default).
// Live tick: ALLOW_BROADCAST=true AND (--yes | SIM_EXECUTE=on). Gate A after merge.
import { randomUUID } from "node:crypto";
import {
  ARC_USDC_ADDRESS,
  LOAN_TERM_TICKS,
  ROSTER,
  type Address,
  type AgentName,
} from "@agent-town/shared";
import {
  CircleTxFailed,
  CircleTxTimeout,
  DEFAULT_FEE,
  DEFAULT_WORKER_NAME,
  DELIVERABLE_HASH,
  COMPLETE_REASON,
  EMPTY_BYTES,
  EXPIRY_SECONDS,
  TREASURY_FNS,
  USDC_APPROVE_FN,
  USDC_APPROVE_SIGNATURE,
  abiFunctionSignature,
  executeContract,
  loadAgenticAbi,
  readRoster,
  resolveJobsAddress,
  resolveTreasuryAddress,
  transferUsdc,
  waitComplete,
  walletFor,
  type CircleClient,
  type ExecuteContractInput,
  type RosterWallet,
  type WalletRoster,
} from "@agent-town/circle";
import type { ProposedAction } from "./decide.js";

export interface ExecuteActionInput {
  tick: number;
  agent: AgentName;
  action: ProposedAction;
}

export type ExecuteActionResult =
  | { status: "complete"; txHash: string; txId?: string; jobId?: string }
  | { status: "pending"; txId: string; error?: string }
  | { status: "failed"; error: string; txId?: string; txHash?: string }
  | { status: "skipped" };

export type ExecuteActionFn = (input: ExecuteActionInput) => Promise<ExecuteActionResult>;

export interface CircleExecuteDeps {
  client: CircleClient;
  roster?: WalletRoster;
  treasuryAddress?: Address;
  jobsAddress?: Address;
  tickMs?: number;
  executeContract?: typeof executeContract;
  transferUsdc?: typeof transferUsdc;
  waitComplete?: typeof waitComplete;
  uuid?: () => string;
  /** Decode on-chain jobId from a createJob receipt (live + mocked tests). */
  jobIdFromTxHash?: (txHash: string) => Promise<string>;
  /** On-chain `activeLoanOf(agent)` — skip `request_loan` when the borrower already has a slot. */
  activeLoanOf?: (agentAddress: Address) => Promise<bigint>;
  /** On-chain Loan.status (0 None … 5 Defaulted). */
  loanStatus?: (loanId: string) => Promise<number>;
}

const SKIP_KINDS = new Set<ProposedAction["kind"]>(["idle", "set_credit_score", "append_review"]);

const LOAN_PENDING = 1;
const LOAN_ACTIVE = 2;

const TREASURY_EXTRA_FNS = {
  withdraw: "withdraw(uint256)",
  denyLoan: "denyLoan(uint256)",
  setBaseRateBps: "setBaseRateBps(uint16)",
  payStipend: "payStipend(address,uint256)",
} as const;

function requireAmount(action: ProposedAction, label: string): string {
  if (!action.amountUsdc) throw new Error(`${label}: amountUsdc required`);
  return action.amountUsdc;
}

/** Pure numeric on-chain id, or null for fixtures like `L-1` / `L-2` (skip, do not fail). */
function parseLoanId(raw: string | undefined, label: string): string | null {
  if (!raw) throw new Error(`${label}: loanId required`);
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  return null;
}

/** Numeric on-chain id, or null for fixture ids like `J-demo` (skip, do not fail). */
function parseJobId(raw: string | undefined, label: string): string | null {
  if (!raw) throw new Error(`${label}: jobId required`);
  const digits = raw.match(/\d+/)?.[0];
  return digits ?? null;
}

function loanTermSeconds(tickMs: number): number {
  return Math.max(1, Math.floor((LOAN_TERM_TICKS * tickMs) / 1000));
}

function walletForAgent(roster: WalletRoster, name: AgentName): RosterWallet {
  return walletFor(roster, name);
}

function resolveToAddress(roster: WalletRoster, to: string | undefined, label: string): Address {
  if (!to) throw new Error(`${label}: to required`);
  if ((ROSTER as readonly { name: string }[]).some((a) => a.name === to)) {
    return walletForAgent(roster, to as AgentName).address as Address;
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(to)) throw new Error(`${label}: invalid to ${to}`);
  return to as Address;
}

async function submitContract(
  deps: CircleExecuteDeps,
  input: Omit<ExecuteContractInput, "fee" | "idempotencyKey"> & { label: string },
): Promise<{ txId: string; txHash: string }> {
  const exec = deps.executeContract ?? executeContract;
  const wait = deps.waitComplete ?? waitComplete;
  const idempotencyKey = (deps.uuid ?? randomUUID)();
  const { txId } = await exec(deps.client, {
    ...input,
    fee: DEFAULT_FEE,
    idempotencyKey,
  });
  const tx = await wait(deps.client, txId);
  if (!tx.txHash) throw new Error(`${input.label} COMPLETE without txHash`);
  return { txId, txHash: tx.txHash };
}

async function approveUsdc(
  deps: CircleExecuteDeps,
  walletId: string,
  spender: Address,
  amountUsdc6: string,
  label: string,
): Promise<{ txId: string; txHash: string }> {
  return submitContract(deps, {
    walletId,
    contractAddress: ARC_USDC_ADDRESS,
    abiFunctionSignature: USDC_APPROVE_FN,
    abiParameters: [spender, amountUsdc6],
    label: `approve USDC (${label})`,
  });
}

function circleErrorMessage(err: unknown): string {
  if (err instanceof CircleTxFailed || err instanceof CircleTxTimeout) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Pure mapping for tests — returns planned Circle op labels without calling the client. */
export function describeExecutePlan(input: ExecuteActionInput): string[] {
  const { agent, action } = input;
  switch (action.kind) {
    case "idle":
    case "set_credit_score":
    case "append_review":
      return [];
    case "buy":
      return [
        `transferUsdc ${agent}→${action.to} amount=${action.amountUsdc}`,
      ];
    case "deposit":
      return [`approve+deposit ${agent} amount=${action.amountUsdc}`];
    case "approve_loan":
      return [`approveLoan ${agent} loan=${action.loanId}`];
    default:
      return [`${action.kind} ${agent}`];
  }
}

export async function executeProposedAction(
  input: ExecuteActionInput,
  deps: CircleExecuteDeps,
): Promise<ExecuteActionResult> {
  const { agent, action } = input;
  if (SKIP_KINDS.has(action.kind)) return { status: "skipped" };

  const roster = deps.roster ?? readRoster();
  const treasury = deps.treasuryAddress ?? resolveTreasuryAddress();
  const jobs = deps.jobsAddress ?? resolveJobsAddress();
  const tickMs = deps.tickMs ?? 15_000;
  const xfer = deps.transferUsdc ?? transferUsdc;
  const agentWallet = walletForAgent(roster, agent);

  try {
    switch (action.kind) {
      case "buy": {
        const amount = requireAmount(action, "buy");
        const to = resolveToAddress(roster, action.to, "buy");
        const { txId } = await xfer(deps.client, {
          walletId: agentWallet.walletId,
          to,
          amountUsdc: amount,
          fee: DEFAULT_FEE,
          idempotencyKey: (deps.uuid ?? randomUUID)(),
        });
        const tx = await (deps.waitComplete ?? waitComplete)(deps.client, txId);
        if (!tx.txHash) throw new Error("buy COMPLETE without txHash");
        return { status: "complete", txHash: tx.txHash, txId };
      }

      case "deposit": {
        const amount = requireAmount(action, "deposit");
        await approveUsdc(deps, agentWallet.walletId, treasury, amount, "deposit");
        const done = await submitContract(deps, {
          walletId: agentWallet.walletId,
          contractAddress: treasury,
          abiFunctionSignature: TREASURY_FNS.deposit,
          abiParameters: [amount],
          label: "deposit",
        });
        return { status: "complete", txHash: done.txHash, txId: done.txId };
      }

      case "withdraw": {
        const amount = requireAmount(action, "withdraw");
        const done = await submitContract(deps, {
          walletId: agentWallet.walletId,
          contractAddress: treasury,
          abiFunctionSignature: TREASURY_EXTRA_FNS.withdraw,
          abiParameters: [amount],
          label: "withdraw",
        });
        return { status: "complete", txHash: done.txHash, txId: done.txId };
      }

      case "request_loan": {
        const amount = requireAmount(action, "request_loan");
        if (deps.activeLoanOf) {
          const existing = await deps.activeLoanOf(agentWallet.address as Address);
          if (existing !== 0n) return { status: "skipped" };
        }
        const term = loanTermSeconds(tickMs);
        const done = await submitContract(deps, {
          walletId: agentWallet.walletId,
          contractAddress: treasury,
          abiFunctionSignature: TREASURY_FNS.requestLoan,
          abiParameters: [amount, String(term)],
          label: "requestLoan",
        });
        return { status: "complete", txHash: done.txHash, txId: done.txId };
      }

      case "approve_loan": {
        const loanId = parseLoanId(action.loanId, "approve_loan");
        if (!loanId) return { status: "skipped" };
        if (deps.loanStatus && (await deps.loanStatus(loanId)) !== LOAN_PENDING) {
          return { status: "skipped" };
        }
        const done = await submitContract(deps, {
          walletId: agentWallet.walletId,
          contractAddress: treasury,
          abiFunctionSignature: TREASURY_FNS.approveLoan,
          abiParameters: [loanId],
          label: "approveLoan",
        });
        return { status: "complete", txHash: done.txHash, txId: done.txId };
      }

      case "deny_loan": {
        const loanId = parseLoanId(action.loanId, "deny_loan");
        if (!loanId) return { status: "skipped" };
        if (deps.loanStatus && (await deps.loanStatus(loanId)) !== LOAN_PENDING) {
          return { status: "skipped" };
        }
        const done = await submitContract(deps, {
          walletId: agentWallet.walletId,
          contractAddress: treasury,
          abiFunctionSignature: TREASURY_EXTRA_FNS.denyLoan,
          abiParameters: [loanId],
          label: "denyLoan",
        });
        return { status: "complete", txHash: done.txHash, txId: done.txId };
      }

      case "repay": {
        const loanId = parseLoanId(action.loanId, "repay");
        if (!loanId) return { status: "skipped" };
        if (deps.loanStatus && (await deps.loanStatus(loanId)) !== LOAN_ACTIVE) {
          return { status: "skipped" };
        }
        const amount = requireAmount(action, "repay");
        await approveUsdc(deps, agentWallet.walletId, treasury, amount, "repay");
        const done = await submitContract(deps, {
          walletId: agentWallet.walletId,
          contractAddress: treasury,
          abiFunctionSignature: TREASURY_FNS.repay,
          abiParameters: [loanId, amount],
          label: "repay",
        });
        return { status: "complete", txHash: done.txHash, txId: done.txId };
      }

      case "mark_default": {
        const loanId = parseLoanId(action.loanId, "mark_default");
        if (!loanId) return { status: "skipped" };
        if (deps.loanStatus && (await deps.loanStatus(loanId)) !== LOAN_ACTIVE) {
          return { status: "skipped" };
        }
        const done = await submitContract(deps, {
          walletId: agentWallet.walletId,
          contractAddress: treasury,
          abiFunctionSignature: TREASURY_FNS.markDefault,
          abiParameters: [loanId],
          label: "markDefault",
        });
        return { status: "complete", txHash: done.txHash, txId: done.txId };
      }

      case "set_rate": {
        if (action.bps === undefined) throw new Error("set_rate: bps required");
        const done = await submitContract(deps, {
          walletId: agentWallet.walletId,
          contractAddress: treasury,
          abiFunctionSignature: TREASURY_EXTRA_FNS.setBaseRateBps,
          abiParameters: [action.bps],
          label: "setBaseRateBps",
        });
        return { status: "complete", txHash: done.txHash, txId: done.txId };
      }

      case "pay_stipend": {
        const amount = requireAmount(action, "pay_stipend");
        let last: { txId: string; txHash: string } | undefined;
        for (const entry of ROSTER.filter((a) => a.role === "consumer")) {
          const to = walletForAgent(roster, entry.name).address;
          last = await submitContract(deps, {
            walletId: agentWallet.walletId,
            contractAddress: treasury,
            abiFunctionSignature: TREASURY_EXTRA_FNS.payStipend,
            abiParameters: [to, amount],
            label: `payStipend ${entry.name}`,
          });
        }
        if (!last) return { status: "skipped" };
        return { status: "complete", txHash: last.txHash, txId: last.txId };
      }

      case "post_job": {
        const amount = requireAmount(action, "post_job");
        const merchant = agentWallet;
        const worker = walletForAgent(roster, DEFAULT_WORKER_NAME);
        const abi = loadAgenticAbi();
        const expiredAt = BigInt(Math.floor(Date.now() / 1000)) + EXPIRY_SECONDS;
        const done = await submitContract(deps, {
          walletId: merchant.walletId,
          contractAddress: jobs,
          abiFunctionSignature: abiFunctionSignature(abi, "createJob"),
          abiParameters: [
            worker.address,
            merchant.address,
            expiredAt.toString(),
            `sim tick ${input.tick} job ${amount}`,
            "0x0000000000000000000000000000000000000000",
          ],
          label: "createJob",
        });
        const jobId = deps.jobIdFromTxHash
          ? await deps.jobIdFromTxHash(done.txHash)
          : undefined;
        return { status: "complete", txHash: done.txHash, txId: done.txId, jobId };
      }

      case "fund_escrow": {
        if (!action.jobId) return { status: "skipped" };
        const jobId = parseJobId(action.jobId, "fund_escrow");
        if (!jobId) return { status: "skipped" };
        const amount = requireAmount(action, "fund_escrow");
        const merchant = agentWallet;
        const worker = walletForAgent(roster, DEFAULT_WORKER_NAME);
        const abi = loadAgenticAbi();
        await submitContract(deps, {
          walletId: worker.walletId,
          contractAddress: jobs,
          abiFunctionSignature: abiFunctionSignature(abi, "setBudget"),
          abiParameters: [jobId, amount, EMPTY_BYTES],
          label: "setBudget",
        });
        await submitContract(deps, {
          walletId: merchant.walletId,
          contractAddress: ARC_USDC_ADDRESS,
          abiFunctionSignature: USDC_APPROVE_SIGNATURE,
          abiParameters: [jobs, amount],
          label: "approve USDC for fund",
        });
        const done = await submitContract(deps, {
          walletId: merchant.walletId,
          contractAddress: jobs,
          abiFunctionSignature: abiFunctionSignature(abi, "fund"),
          abiParameters: [jobId, EMPTY_BYTES],
          label: "fund",
        });
        return { status: "complete", txHash: done.txHash, txId: done.txId };
      }

      case "accept_job": {
        const jobId = parseJobId(action.jobId, "accept_job");
        if (!jobId) return { status: "skipped" };
        const abi = loadAgenticAbi();
        const done = await submitContract(deps, {
          walletId: agentWallet.walletId,
          contractAddress: jobs,
          abiFunctionSignature: abiFunctionSignature(abi, "setProvider"),
          abiParameters: [jobId, agentWallet.address],
          label: "setProvider",
        });
        return { status: "complete", txHash: done.txHash, txId: done.txId };
      }

      case "deliver": {
        const jobId = parseJobId(action.jobId, "deliver");
        if (!jobId) return { status: "skipped" };
        const abi = loadAgenticAbi();
        const done = await submitContract(deps, {
          walletId: agentWallet.walletId,
          contractAddress: jobs,
          abiFunctionSignature: abiFunctionSignature(abi, "submit"),
          abiParameters: [jobId, DELIVERABLE_HASH, EMPTY_BYTES],
          label: "submit",
        });
        return { status: "complete", txHash: done.txHash, txId: done.txId };
      }

      case "complete_job": {
        const jobId = parseJobId(action.jobId, "complete_job");
        if (!jobId) return { status: "skipped" };
        const abi = loadAgenticAbi();
        const done = await submitContract(deps, {
          walletId: agentWallet.walletId,
          contractAddress: jobs,
          abiFunctionSignature: abiFunctionSignature(abi, "complete"),
          abiParameters: [jobId, COMPLETE_REASON, EMPTY_BYTES],
          label: "complete",
        });
        return { status: "complete", txHash: done.txHash, txId: done.txId };
      }

      case "idle":
      case "set_credit_score":
      case "append_review":
        return { status: "skipped" };
    }
  } catch (err) {
    if (err instanceof CircleTxTimeout) {
      return { status: "pending", txId: err.txId, error: err.message };
    }
    return { status: "failed", error: circleErrorMessage(err) };
  }
}

export function createExecuteAction(deps: CircleExecuteDeps): ExecuteActionFn {
  return (input) => executeProposedAction(input, deps);
}

export const EXECUTE_SKIP_KINDS = SKIP_KINDS;
