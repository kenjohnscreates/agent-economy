// Off-roster visitor agent (M9.6/M9.7). Not in AGENT_NAMES / sim decide().
// Label rules + NL intent parser + illustrative 30-day bank-rate quote.
import { z } from "zod";
import { AGENT_NAMES } from "./roster.js";

export const VISITOR_AVATAR = "/sprites/visitor.png" as const;
export const VISITOR_ROLE = "consumer" as const;
export const VISITOR_STORAGE_KEY = "agent-town.visitor" as const;
export const MAX_VISITORS = 32;
export const MAX_SUBAGENTS = 8;

/** Same year/bps as TownTreasury._pendingInterest. */
export const INTEREST_BPS = 10_000n;
export const YEAR_SECONDS = 365n * 24n * 60n * 60n;
export const THIRTY_DAY_SECONDS = 30n * 24n * 60n * 60n;

/** Labels that would collide with the town, bank alias, or roster. */
export const RESERVED_VISITOR_LABELS = new Set<string>([
  ...AGENT_NAMES,
  "bank",
  "botanica",
  "mayor",
  "eth",
  "www",
]);

const LABEL_RE = /^[a-z0-9]([a-z0-9-]{1,14}[a-z0-9])?$/;

export function normalizeVisitorLabel(raw: string): string {
  return raw.trim().toLowerCase();
}

/** 3–16 chars, [a-z0-9-], no leading/trailing hyphen, not reserved. */
export function validateVisitorLabel(raw: string): string {
  const label = normalizeVisitorLabel(raw);
  if (label.length < 3 || label.length > 16) {
    throw new Error("Name must be 3–16 characters.");
  }
  if (!LABEL_RE.test(label) || label.includes(".")) {
    throw new Error("Use lowercase letters, numbers, and hyphens only.");
  }
  if (RESERVED_VISITOR_LABELS.has(label)) {
    throw new Error(`"${label}" is already taken in botanica.`);
  }
  return label;
}

export const VisitorIntentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("balance") }),
  z.object({ kind: z.literal("deposit_percent"), bps: z.int().min(1).max(10_000) }),
  z.object({ kind: z.literal("deposit_usdc"), amountUsdc: z.string().regex(/^\d+$/) }),
  z.object({ kind: z.literal("create_subagent"), label: z.string().min(3).max(16) }),
  z.object({ kind: z.literal("refuse"), reason: z.string().min(1) }),
]);
export type VisitorIntent = z.infer<typeof VisitorIntentSchema>;

function humanToUsdc6(raw: string): string | undefined {
  const m = raw.match(/^(\d+)(?:\.(\d{1,6}))?$/);
  if (!m) return undefined;
  const whole = m[1] ?? "0";
  const frac = (m[2] ?? "").padEnd(6, "0");
  const n = BigInt(whole) * 1_000_000n + BigInt(frac);
  return n > 0n ? n.toString() : undefined;
}

/**
 * Deterministic parse of deposit/balance/subagent asks. Anything else is refuse
 * (LLM may still map paraphrases before this runs).
 */
export function parseVisitorIntent(text: string): VisitorIntent {
  const t = text.trim().toLowerCase();
  if (!t) return { kind: "refuse", reason: "Say something like: deposit 50% into the town bank." };

  if (
    /\b(revoke|default|approve loan|deny|mark_default|borrow|request.?loan|transfer to|send to|drain)\b/.test(
      t,
    )
  ) {
    return { kind: "refuse", reason: "I can only check my balance, deposit into the town bank, or mint a subagent." };
  }

  const sub = t.match(
    /\b(?:create|mint|spawn|add)\s+(?:a\s+)?(?:subagent|sub-agent|subdomain|sub-name|subname)\s+([a-z0-9-]{3,16})\b/,
  );
  if (sub?.[1]) {
    try {
      return { kind: "create_subagent", label: validateVisitorLabel(sub[1]) };
    } catch (e) {
      return { kind: "refuse", reason: e instanceof Error ? e.message : "Invalid subagent name." };
    }
  }

  if (/\b(balance|how much|what do i have|wallet)\b/.test(t) && !/\bdeposit\b/.test(t)) {
    return { kind: "balance" };
  }

  const depositish = /\b(deposit|put|save|bank|treasury)\b/.test(t);
  if (depositish && /\b(all|everything|100\s*%|full)\b/.test(t)) {
    return { kind: "deposit_percent", bps: 10_000 };
  }
  if (depositish && (/\bhalf\b/.test(t) || /\b50\s*%/.test(t))) {
    return { kind: "deposit_percent", bps: 5_000 };
  }
  const pct = t.match(/(\d{1,3})\s*%/);
  if (depositish && pct) {
    const n = Number(pct[1]);
    if (n >= 1 && n <= 100) return { kind: "deposit_percent", bps: n * 100 };
  }
  const usdc = t.match(/\b(\d+(?:\.\d{1,6})?)\s*(?:usdc|usd)?\b/);
  if (depositish && usdc && !pct) {
    const amount = humanToUsdc6(usdc[1] ?? "");
    if (amount) return { kind: "deposit_usdc", amountUsdc: amount };
  }

  return { kind: "refuse", reason: "I can only check my balance, deposit into the town bank, or mint a subagent." };
}

export function percentOf(balanceUsdc: string, bps: number): string {
  const bal = BigInt(balanceUsdc);
  const amt = (bal * BigInt(bps)) / 10_000n;
  return amt.toString();
}

/** Display 6-dec base units as "1.5 USDC". */
export function formatUsdcHuman(amountUsdc: string): string {
  const n = BigInt(amountUsdc);
  const whole = n / 1_000_000n;
  const frac = (n % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac.length > 0 ? `${whole}.${frac} USDC` : `${whole} USDC`;
}

/** `810` → `"8.10%"`. */
export function formatRateApr(bps: number): string {
  const n = Math.max(0, Math.trunc(bps));
  const whole = Math.floor(n / 100);
  const frac = (n % 100).toString().padStart(2, "0");
  return `${whole}.${frac}%`;
}

/**
 * TownTreasury simple interest: P × rateBps × elapsed / (10_000 × 365 days).
 * Default elapsed = 30 days. Not an on-chain credit to depositors.
 */
export function illustrativeInterestUsdc(
  principalUsdc: string,
  rateBps: number,
  elapsedSeconds: bigint = THIRTY_DAY_SECONDS,
): string {
  const p = BigInt(principalUsdc);
  const r = BigInt(Math.max(0, Math.trunc(rateBps)));
  return ((p * r * elapsedSeconds) / (INTEREST_BPS * YEAR_SECONDS)).toString();
}

/** Chat line after a successful deposit, including the 30-day illustrative quote. */
export function depositReply(amountUsdc: string, townRateBps: number): string {
  const extra = illustrativeInterestUsdc(amountUsdc, townRateBps);
  return (
    `Deposited ${formatUsdcHuman(amountUsdc)} into the town bank. ` +
    `At today's town rate (${formatRateApr(townRateBps)} APY), a 30-day hold would illustrate ~${formatUsdcHuman(extra)} extra. ` +
    `Borrowers pay that rate to the bank; deposits are not credited on-chain yet.`
  );
}
