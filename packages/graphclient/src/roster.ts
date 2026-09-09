/**
 * Town roster addresses for subgraph filters.
 * Loads packages/circle/roster.json (9 wallets: 8 agents + mayor).
 * Outputs lowercase `0x` addresses used in Graph `Bytes` filters.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROSTER_PATH = fileURLToPath(new URL("../../circle/roster.json", import.meta.url));

export const TREASURY_STATE_ID = "treasury" as const;

export const OPEN_JOB_STATUSES = ["open", "funded", "submitted"] as const;

let cachedRoster: readonly `0x${string}`[] | null = null;

/** Normalize subgraph/agent address to lowercase hex. */
export function normalizeAddress(address: string): `0x${string}` {
  const trimmed = address.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(trimmed)) {
    throw new Error(`Invalid address: ${address}`);
  }
  return trimmed as `0x${string}`;
}

/** Town wallet addresses from roster.json (agents + mayor). */
export function townRosterAddresses(): readonly `0x${string}`[] {
  if (cachedRoster) return cachedRoster;
  const raw = JSON.parse(readFileSync(ROSTER_PATH, "utf8")) as {
    wallets: { address: string }[];
  };
  cachedRoster = raw.wallets.map((w) => normalizeAddress(w.address));
  return cachedRoster;
}

/** Resolve agent lookup key: ENS name or hex address. */
export function resolveAgentKey(key: string): { byEns: boolean; value: string } {
  const trimmed = key.trim();
  if (trimmed.includes(".")) {
    return { byEns: true, value: trimmed };
  }
  return { byEns: false, value: normalizeAddress(trimmed) };
}
