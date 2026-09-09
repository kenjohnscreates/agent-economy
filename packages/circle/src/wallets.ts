// Wallet-set + wallet provisioning, idempotent. Inputs: injected `CircleClient`,
// env-ish options, roster (in-memory; caller persists). Outputs: wallet set id and
// `{name, walletId, address}[]`. Creation is the only place funds-relevant state is
// born, so every create call is logged (ids/addresses only — never secrets).
// SDK methods: createWalletSet, getWalletSet, createWallets (accountType SCA,
// blockchains ['ARC-TESTNET'], metadata[{name, refId}]), listWallets({walletSetId, refId}).
// https://developers.circle.com/wallets/dev-controlled/create-your-first-wallet
import { ARC_TESTNET_BLOCKCHAIN, type CircleClient, type CircleWallet } from "./client.js";
import {
  RosterWalletSchema,
  WALLET_NAMES,
  type RosterWallet,
  type WalletName,
  type WalletRoster,
} from "./roster.js";

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
}
export const silentLogger: Logger = { info() {}, warn() {} };

export interface EnsureWalletSetOptions {
  /** From env `CIRCLE_WALLET_SET_ID` — when set we only verify it exists. */
  walletSetId?: string | null;
  /** Fallback id previously persisted in roster.json. */
  rosterWalletSetId?: string | null;
  log?: Logger;
}

/**
 * Idempotent: if an id is known (env, else roster) → `getWalletSet` verifies it;
 * otherwise `createWalletSet({name})` and the caller must copy the id into `.env`.
 */
export async function ensureWalletSet(
  client: CircleClient,
  name: string,
  opts: EnsureWalletSetOptions = {},
): Promise<{ walletSetId: string; created: boolean }> {
  const log = opts.log ?? silentLogger;
  const known = opts.walletSetId ?? opts.rosterWalletSetId ?? null;
  if (known) {
    const res = await client.getWalletSet({ id: known });
    const id = res.data?.walletSet?.id;
    if (!id) throw new Error(`Wallet set ${known} not found (getWalletSet returned no data)`);
    if (!opts.walletSetId) {
      log.warn(`CIRCLE_WALLET_SET_ID unset — using id from roster.json (${id}); add it to .env`);
    }
    return { walletSetId: id, created: false };
  }
  const res = await client.createWalletSet({ name });
  const id = res.data?.walletSet?.id;
  if (!id) throw new Error("createWalletSet returned no wallet set id");
  log.info(`Created wallet set "${name}" → CIRCLE_WALLET_SET_ID=${id}  (add to .env)`);
  return { walletSetId: id, created: true };
}

export interface EnsureRosterWalletsOptions {
  /** Names to ensure; defaults to the 8 agents + mayor. */
  names?: readonly WalletName[];
  log?: Logger;
}

function toRosterWallet(name: WalletName, w: CircleWallet): RosterWallet {
  return RosterWalletSchema.parse({ name, walletId: w.id, address: w.address });
}

/**
 * Ensures one SCA wallet on ARC-TESTNET per name. Idempotent in two layers:
 *  1. names already in `roster.wallets` → no API call at all;
 *  2. names missing from roster → `listWallets({walletSetId, refId: name})` recovers
 *     wallets created in an earlier, interrupted run (refId === name);
 *  3. still missing → ONE `createWallets` call with `count = missing.length` and
 *     `metadata[i] = {name, refId: name}`.
 * Returns the full roster list (existing + recovered + created), sorted by WALLET_NAMES.
 */
export async function ensureRosterWallets(
  client: CircleClient,
  walletSetId: string,
  roster: WalletRoster,
  opts: EnsureRosterWalletsOptions = {},
): Promise<{ wallets: RosterWallet[]; created: WalletName[]; recovered: WalletName[] }> {
  const log = opts.log ?? silentLogger;
  const names = opts.names ?? WALLET_NAMES;
  const byName = new Map<WalletName, RosterWallet>(roster.wallets.map((w) => [w.name, w]));

  const missing = names.filter((n) => !byName.has(n));
  const recovered: WalletName[] = [];
  for (const name of missing) {
    const res = await client.listWallets({
      walletSetId,
      refId: name,
      blockchain: ARC_TESTNET_BLOCKCHAIN,
    });
    const found = res.data?.wallets?.find((w) => w.refId === name);
    if (found) {
      byName.set(name, toRosterWallet(name, found));
      recovered.push(name);
      log.info(`Recovered existing wallet for ${name}: ${found.address} (${found.id})`);
    }
  }

  const toCreate = missing.filter((n) => !byName.has(n));
  const created: WalletName[] = [];
  if (toCreate.length > 0) {
    const res = await client.createWallets({
      walletSetId,
      accountType: "SCA",
      blockchains: [ARC_TESTNET_BLOCKCHAIN],
      count: toCreate.length,
      metadata: toCreate.map((name) => ({ name, refId: name })),
    });
    const wallets = res.data?.wallets ?? [];
    if (wallets.length !== toCreate.length) {
      throw new Error(
        `createWallets returned ${wallets.length} wallets, expected ${toCreate.length}`,
      );
    }
    // Match by refId (authoritative), falling back to positional order.
    toCreate.forEach((name, i) => {
      const w = wallets.find((x) => x.refId === name) ?? wallets[i];
      if (!w) throw new Error(`createWallets: no wallet for ${name}`);
      byName.set(name, toRosterWallet(name, w));
      created.push(name);
      log.info(`Created wallet for ${name}: ${w.address} (${w.id})`);
    });
  }

  const wallets = names.map((n) => {
    const w = byName.get(n);
    if (!w) throw new Error(`ensureRosterWallets: ${n} still missing`);
    return w;
  });
  return { wallets, created, recovered };
}
