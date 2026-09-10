// Mayor panel helpers (M5.7). Pure functions, unit-tested. Money stays a 6-decimal
// USDC string (parseUsdc), rates stay integer bps inside the shared 100 to 2000 band.
import {
  BASE_RATE_MAX_BPS,
  BASE_RATE_MIN_BPS,
  type MayorFundRequest,
  type TxResponse,
} from "@agent-town/shared";
import { ApiRequestError } from "./api";
import { parseUsdc } from "./usdc";

export const RATE_STEP_BPS = 10;

/** Round to the slider step and clamp into the shared band. Non-finite input falls to the floor. */
export function snapBps(bps: number, step = RATE_STEP_BPS): number {
  if (!Number.isFinite(bps)) return BASE_RATE_MIN_BPS;
  const snapped = Math.round(bps / step) * step;
  return Math.min(BASE_RATE_MAX_BPS, Math.max(BASE_RATE_MIN_BPS, snapped));
}

/**
 * Human USDC ("1", "0.50") to the frozen fund body. Throws with a readable message on
 * malformed or zero amounts so the panel can toast it without a network call.
 */
export function fundBody(human: string): MayorFundRequest {
  let amountUsdc: string;
  try {
    amountUsdc = parseUsdc(human);
  } catch {
    throw new Error(`"${human.trim()}" is not a USDC amount. Use digits with up to 6 decimals.`);
  }
  if (BigInt(amountUsdc) <= 0n) throw new Error("Amount must be more than 0 USDC.");
  return { amountUsdc };
}

export interface Toast {
  id: number;
  tone: "ok" | "error";
  title: string;
  href?: string;
  detail?: string;
}

/** Success toast: `{kind} · {txHash.slice(0,10)}…` plus the explorer link. */
export function txToast(kind: string, res: TxResponse): Omit<Toast, "id"> {
  return { tone: "ok", title: `${kind} · ${res.txHash.slice(0, 10)}…`, href: res.explorerUrl };
}

export const NOT_BROADCAST_MESSAGE = "Mayor txs need ALLOW_BROADCAST=true. The mock does not.";

/** Error toast text. 501 from real mode gets the brief's wording; nothing is invented. */
export function describeError(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.status === 501) return NOT_BROADCAST_MESSAGE;
    return `${err.message} (${err.code})`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export function errorToast(kind: string, err: unknown): Omit<Toast, "id"> {
  return { tone: "error", title: `${kind} failed`, detail: describeError(err) };
}
