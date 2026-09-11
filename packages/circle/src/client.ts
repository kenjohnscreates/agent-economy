// Circle Developer-Controlled Wallets client factory + the narrow client surface
// the rest of this package depends on (so tests can inject a mock).
// Inputs: process.env-like record. Outputs: SDK client / `CircleClient` interface.
// Secrets (CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET) are validated but NEVER logged.
// SDK: @circle-fin/developer-controlled-wallets — initiateDeveloperControlledWalletsClient
// https://developers.circle.com/wallets/dev-controlled/create-your-first-wallet
import {
  initiateDeveloperControlledWalletsClient,
  type CreateContractExecutionTransactionInput,
  type CreateTransferTransactionInput,
  type CreateWalletSetInput,
  type CreateWalletsInput,
  type GetTransactionInput,
  type GetWalletSetInput,
  type GetWalletTokenBalanceInput,
  type ListWalletsInput,
} from "@circle-fin/developer-controlled-wallets";
import { z } from "zod";

/** Circle blockchain identifier for Arc Testnet (Circle `Blockchain` enum). */
export const ARC_TESTNET_BLOCKCHAIN = "ARC-TESTNET" as const;

/** Circle blockchain identifier for Ethereum Sepolia (Gateway deposit source). */
export const ETH_SEPOLIA_BLOCKCHAIN = "ETH-SEPOLIA" as const;

/** Env vars this package needs for live calls. Secrets are redacted in errors. */
export const CircleEnvSchema = z.object({
  CIRCLE_API_KEY: z.string().min(1, "CIRCLE_API_KEY is required"),
  CIRCLE_ENTITY_SECRET: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "CIRCLE_ENTITY_SECRET must be 32-byte hex (64 chars)"),
  CIRCLE_WALLET_SET_ID: z.string().min(1).optional(),
  CIRCLE_WALLET_SET_NAME: z.string().min(1).default("agent-town"),
});
export type CircleEnv = z.infer<typeof CircleEnvSchema>;

/** Parse env; throws a message that names missing vars but never echoes values. */
export function parseCircleEnv(env: Record<string, string | undefined> = process.env): CircleEnv {
  const r = CircleEnvSchema.safeParse({
    CIRCLE_API_KEY: env.CIRCLE_API_KEY || undefined,
    CIRCLE_ENTITY_SECRET: env.CIRCLE_ENTITY_SECRET || undefined,
    CIRCLE_WALLET_SET_ID: env.CIRCLE_WALLET_SET_ID || undefined,
    CIRCLE_WALLET_SET_NAME: env.CIRCLE_WALLET_SET_NAME || undefined,
  });
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid Circle env — ${issues}`);
  }
  return r.data;
}

// ─── Narrow client surface (dependency-injection seam) ──────────────────────────
// Only the `data` fields we read are typed; the real SDK client is a structural
// superset and is assignable to this interface.

export type WalletState = "LIVE" | "FROZEN";
export type TxState =
  | "INITIATED"
  | "PENDING_RISK_SCREENING"
  | "CLEARED"
  | "QUEUED"
  | "SENT"
  | "STUCK"
  | "CONFIRMED"
  | "COMPLETE"
  | "FAILED"
  | "DENIED"
  | "CANCELLED";

export interface CircleWallet {
  id: string;
  address: string;
  blockchain: string;
  name?: string;
  refId?: string;
  state?: WalletState | string;
}

export interface CircleTx {
  id: string;
  state: TxState | string;
  txHash?: string;
  errorReason?: string;
  errorDetails?: string;
  blockchain?: string;
}

export interface CircleTokenBalance {
  amount: string; // decimal string in token units (e.g. "3.5" USDC)
  token: {
    id: string;
    symbol?: string;
    decimals?: number;
    tokenAddress?: string;
    isNative?: boolean;
    blockchain?: string;
  };
}

export interface CircleClient {
  createWalletSet(input: CreateWalletSetInput): Promise<{ data?: { walletSet: { id: string } } }>;
  getWalletSet(input: GetWalletSetInput): Promise<{ data?: { walletSet: { id: string } } }>;
  createWallets(input: CreateWalletsInput): Promise<{ data?: { wallets: CircleWallet[] } }>;
  listWallets(input?: ListWalletsInput): Promise<{ data?: { wallets: CircleWallet[] } }>;
  createContractExecutionTransaction(
    input: CreateContractExecutionTransactionInput,
  ): Promise<{ data?: { id: string; state: string } }>;
  createTransaction(
    input: CreateTransferTransactionInput,
  ): Promise<{ data?: { id: string; state: string } }>;
  getTransaction(input: GetTransactionInput): Promise<{ data?: { transaction?: CircleTx } }>;
  getWalletTokenBalance(
    input: GetWalletTokenBalanceInput,
  ): Promise<{ data?: { tokenBalances?: CircleTokenBalance[] } }>;
}

/**
 * Build the live SDK client from env. Requires CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET.
 * The entity secret is encrypted per request by the SDK (entitySecretCiphertext) —
 * it must already be REGISTERED in Console, see README setup order.
 */
export function createCircleClient(
  env: Record<string, string | undefined> = process.env,
): CircleClient {
  const parsed = parseCircleEnv(env);
  return initiateDeveloperControlledWalletsClient({
    apiKey: parsed.CIRCLE_API_KEY,
    entitySecret: parsed.CIRCLE_ENTITY_SECRET,
  });
}
