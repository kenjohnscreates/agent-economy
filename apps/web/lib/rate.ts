// Bank panel helpers (M5.4). Pure functions so they are unit-tested and reusable.
// Rates stay in bps and money stays a 6-decimal USDC string; the only float is the
// percent formatting at the very end, inside formatBps.
import type { Loan, LoanStatus, RateBreakdown } from "@agent-town/shared";
import { formatBps } from "./usdc";

export interface RateRow {
  label: string;
  bps: number;
}

/**
 * The town rate as it stacks on the real anchor (PRD §12):
 * market APY + spread + default premium = town rate.
 * `clamped` is true when the plain sum differs from the reported town rate, which
 * happens when the base rate hit its 1.00% or 20.00% band in rules.ts.
 */
export function rateStack(rate: RateBreakdown): {
  rows: RateRow[];
  sumBps: number;
  townRateBps: number;
  clamped: boolean;
} {
  const rows: RateRow[] = [
    { label: "market APY", bps: rate.marketApyBps },
    { label: "spread", bps: rate.spreadBps },
    { label: "default premium", bps: rate.defaultPremiumBps },
  ];
  const sumBps = rows.reduce((acc, r) => acc + r.bps, 0);
  return { rows, sumBps, townRateBps: rate.townRateBps, clamped: sumBps !== rate.townRateBps };
}

/** "4.10% + 2.00% + 2.00% = 8.10%" */
export function formatRateStack(rate: RateBreakdown): string {
  const { rows, townRateBps } = rateStack(rate);
  return `${rows.map((r) => formatBps(r.bps)).join(" + ")} = ${formatBps(townRateBps)}`;
}

/** Rules approve while utilisation < 80% (PRD §5); the panel warns from 60%. */
export const UTILISATION_CAP_BPS = 8000;
export const UTILISATION_WARN_BPS = 6000;
export type Tone = "ok" | "warn" | "danger";
export function utilisationTone(bps: number): Tone {
  if (bps >= UTILISATION_CAP_BPS) return "danger";
  if (bps >= UTILISATION_WARN_BPS) return "warn";
  return "ok";
}

/** "just now" / "12s ago" / "3m ago" / "2h ago" / "3d ago"; "unknown" for a bad timestamp. */
export function formatAge(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown";
  const s = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** "2026-09-08 18:01:45 UTC"; returns the input untouched if it does not parse. */
export function formatUtc(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return `${new Date(t).toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export interface LoanBook {
  open: Loan[];
  pending: Loan[];
  closed: Loan[];
}
const CLOSED: readonly LoanStatus[] = ["repaid", "defaulted", "denied"];
const newestFirst = (a: Loan, b: Loan) => b.requestedAtTick - a.requestedAtTick;

/** Buckets the loan book for display, newest request first inside each bucket. */
export function groupLoans(loans: Loan[]): LoanBook {
  return {
    open: loans.filter((l) => l.status === "approved").sort(newestFirst),
    pending: loans.filter((l) => l.status === "pending").sort(newestFirst),
    closed: loans.filter((l) => CLOSED.includes(l.status)).sort(newestFirst),
  };
}

/** The tick a loan's latest decision happened at: default, else approval, else request. */
export function decidedAtTick(l: Loan): number {
  return l.defaultedAtTick ?? l.approvedAtTick ?? l.requestedAtTick;
}

/** The loan carrying the most recent advisor verdict, for the "latest decision" line. */
export function latestVerdict(loans: Loan[]): Loan | null {
  let best: Loan | null = null;
  for (const l of loans) {
    if (!l.advisor) continue;
    if (!best || decidedAtTick(l) > decidedAtTick(best)) best = l;
  }
  return best;
}

/** Upsert by id, keeping the original order for known loans. Used for `loan_flagged`. */
export function upsertLoan(loans: Loan[], loan: Loan): Loan[] {
  const i = loans.findIndex((l) => l.id === loan.id);
  if (i === -1) return [...loans, loan];
  const next = loans.slice();
  next[i] = loan;
  return next;
}
