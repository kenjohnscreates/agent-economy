// USDC helpers. The contract carries USDC as 6-decimal integer strings ("3000000" = 3 USDC).
// Never let a float touch money: BigInt in, string out.
import { ARC_USDC_DECIMALS } from "@agent-town/shared";

const SCALE = 10n ** BigInt(ARC_USDC_DECIMALS);

/** "3000000" -> "3.00"; "1860655" -> "1.86". `dp` caps fractional digits (default 2). */
export function formatUsdc(micro: string | null | undefined, dp = 2): string {
  if (micro == null || micro === "") return "0.00";
  let n: bigint;
  try {
    n = BigInt(micro);
  } catch {
    return "0.00";
  }
  const neg = n < 0n;
  if (neg) n = -n;
  const whole = n / SCALE;
  const frac = (n % SCALE).toString().padStart(ARC_USDC_DECIMALS, "0").slice(0, dp);
  const s = dp > 0 ? `${whole}.${frac}` : `${whole}`;
  return neg ? `-${s}` : s;
}

/** Compact for tiles: "42500000" -> "42.5", "184538905000000" -> "184.5M". */
export function formatUsdcShort(micro: string | null | undefined): string {
  const v = Number(formatUsdc(micro, 6));
  if (!Number.isFinite(v)) return "0";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return abs >= 100 ? v.toFixed(0) : v.toFixed(2);
}

/** "3" or "3.5" -> "3000000" / "3500000". Throws on malformed input. */
export function parseUsdc(human: string): string {
  const m = /^\s*(\d+)(?:\.(\d{0,6}))?\s*$/.exec(human);
  if (!m) throw new Error(`not a USDC amount: ${human}`);
  const whole = BigInt(m[1] ?? "0");
  const frac = BigInt((m[2] ?? "").padEnd(ARC_USDC_DECIMALS, "0"));
  return (whole * SCALE + frac).toString();
}

/** bps -> "6.10%" */
export function formatBps(bps: number, dp = 2): string {
  return `${(bps / 100).toFixed(dp)}%`;
}
