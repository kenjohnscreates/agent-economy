// roster.json persistence — the committed map from agent name → Circle wallet
// id + on-chain address (addresses are public; wallet ids are not secret but are
// kept minimal). Inputs: file path (defaults to packages/circle/roster.json).
// Outputs: zod-validated `WalletRoster`.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_NAMES } from "@agent-town/shared";
import { z } from "zod";
import { ARC_TESTNET_BLOCKCHAIN } from "./client.js";

/** The 9 wallet owners: 8 roster agents + the mayor (town treasury operator). */
export const MAYOR_NAME = "mayor" as const;
export const WALLET_NAMES = [...AGENT_NAMES, MAYOR_NAME] as const;
export type WalletName = (typeof WALLET_NAMES)[number];
export const WalletNameSchema = z.enum(WALLET_NAMES);

export const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "EVM address");

export const RosterWalletSchema = z.object({
  name: WalletNameSchema,
  walletId: z.string().min(1),
  address: AddressSchema,
});
export type RosterWallet = z.infer<typeof RosterWalletSchema>;

export const WalletRosterSchema = z.object({
  blockchain: z.literal(ARC_TESTNET_BLOCKCHAIN),
  accountType: z.literal("SCA"),
  walletSetId: z.string().min(1).nullable(),
  wallets: z
    .array(RosterWalletSchema)
    .refine((ws) => new Set(ws.map((w) => w.name)).size === ws.length, "duplicate wallet names"),
});
export type WalletRoster = z.infer<typeof WalletRosterSchema>;

export const EMPTY_ROSTER: WalletRoster = {
  blockchain: ARC_TESTNET_BLOCKCHAIN,
  accountType: "SCA",
  walletSetId: null,
  wallets: [],
};

/** Default location: `<package root>/roster.json` (works from src/ and dist/). */
export const DEFAULT_ROSTER_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "roster.json",
);

export function readRoster(path: string = DEFAULT_ROSTER_PATH): WalletRoster {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY_ROSTER);
    throw e;
  }
  return WalletRosterSchema.parse(JSON.parse(raw));
}

export function writeRoster(roster: WalletRoster, path: string = DEFAULT_ROSTER_PATH): void {
  const valid = WalletRosterSchema.parse(roster);
  writeFileSync(path, `${JSON.stringify(valid, null, 2)}\n`, "utf8");
}

/** Lookup helper for callers (sim) — throws if the agent has no wallet yet. */
export function walletFor(roster: WalletRoster, name: WalletName): RosterWallet {
  const w = roster.wallets.find((x) => x.name === name);
  if (!w) throw new Error(`roster.json has no wallet for "${name}" — run setup-wallets`);
  return w;
}
