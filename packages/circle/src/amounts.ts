// Amount helpers for USDC on Arc.
//
// THE 6-vs-18 DECIMAL TRAP (ARCHITECTURE §2, RISKS R8):
//   • USDC ERC-20 interface 0x3600…0000 has **6 decimals**. Every contract call,
//     Circle transfer and app-level amount in this repo is a 6-dec base-unit string
//     ("3000000" = 3 USDC). This is the only representation the sim passes around.
//   • The *native* gas balance (eth_getBalance / gas math / `value` on a raw tx) is
//     the same USDC but with **18 decimals** (1e12× larger numbers). Never feed a
//     6-dec amount into an 18-dec field or vice-versa.
//   • Circle's transfer API (`createTransaction.amount`) and balances API return
//     *decimal* strings in token units ("3.5"), not base units. Convert at the edge
//     with the helpers below; keep base-unit strings everywhere else.
import { ARC_NATIVE_GAS_DECIMALS, ARC_USDC_DECIMALS } from "@agent-town/shared";

const BASE_UNIT_RE = /^\d+$/;
const DECIMAL_RE = /^\d+(\.\d+)?$/;

/** Insert a decimal point `decimals` places from the right; trims trailing zeros. */
export function baseUnitsToDecimal(base: string | bigint, decimals: number): string {
  const s = typeof base === "bigint" ? base.toString() : base;
  if (!BASE_UNIT_RE.test(s)) throw new Error(`baseUnitsToDecimal: not a base-unit integer: ${s}`);
  const padded = s.padStart(decimals + 1, "0");
  const int = padded.slice(0, padded.length - decimals);
  const frac = padded.slice(padded.length - decimals).replace(/0+$/, "");
  return frac.length ? `${int}.${frac}` : int;
}

/** Parse a decimal string ("3.5") to base units ("3500000") for `decimals`; rejects excess precision. */
export function decimalToBaseUnits(dec: string, decimals: number): string {
  if (!DECIMAL_RE.test(dec)) throw new Error(`decimalToBaseUnits: not a decimal string: ${dec}`);
  const [int = "0", frac = ""] = dec.split(".");
  if (frac.length > decimals) {
    throw new Error(`decimalToBaseUnits: ${dec} exceeds ${decimals} decimals`);
  }
  const combined = `${int}${frac.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
  return combined;
}

/** "3000000" → "3"; "3500000" → "3.5"; "1" → "0.000001". For Circle `amount` fields. */
export function toUsdcDecimalString(baseUnits: string | bigint): string {
  return baseUnitsToDecimal(baseUnits, ARC_USDC_DECIMALS);
}

/** "3.5" → "3500000". For Circle balances → app base units. */
export function fromUsdcDecimalString(decimal: string): string {
  return decimalToBaseUnits(decimal, ARC_USDC_DECIMALS);
}

/** Native 18-dec gas balance (wei-like bigint from viem `getBalance`) → decimal USDC string. */
export function nativeToDecimalString(wei: bigint): string {
  return baseUnitsToDecimal(wei, ARC_NATIVE_GAS_DECIMALS);
}
