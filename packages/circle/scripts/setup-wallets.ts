// One-shot provisioning: wallet set + 9 SCA wallets on ARC-TESTNET → roster.json.
// Usage (from repo root):
//   pnpm --filter @agent-town/circle setup-wallets --dry-run   # plan only, no env, no API
//   pnpm --filter @agent-town/circle setup-wallets --yes       # LIVE: needs CIRCLE_* env
// Idempotent: re-running skips names already in roster.json and recovers wallets by refId.
// Never prints secrets. Exit code 1 on any failure (RISKS R8/R9: no silent partial state).
import { parseArgs } from "node:util";
import {
  ARC_TESTNET_BLOCKCHAIN,
  CircleEnvSchema,
  DEFAULT_ROSTER_PATH,
  WALLET_NAMES,
  createCircleClient,
  ensureRosterWallets,
  ensureWalletSet,
  parseCircleEnv,
  readRoster,
  writeRoster,
  type Logger,
} from "../src/index.js";

const { values: flags } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
  },
  strict: true,
});

const log: Logger = {
  info: (m) => console.log(`  ${m}`),
  warn: (m) => console.warn(`  ! ${m}`),
};

function plan() {
  const roster = readRoster();
  const walletSetName = process.env.CIRCLE_WALLET_SET_NAME || "agent-town";
  const envSetId = process.env.CIRCLE_WALLET_SET_ID || null;
  const existing = new Set(roster.wallets.map((w) => w.name));
  const missing = WALLET_NAMES.filter((n) => !existing.has(n));
  console.log(`setup-wallets plan  (roster: ${DEFAULT_ROSTER_PATH})`);
  console.log(`  blockchain     : ${ARC_TESTNET_BLOCKCHAIN}   accountType: SCA`);
  console.log(
    `  wallet set     : ${
      envSetId
        ? `verify CIRCLE_WALLET_SET_ID=${envSetId} (getWalletSet)`
        : roster.walletSetId
          ? `verify roster walletSetId=${roster.walletSetId} (getWalletSet)`
          : `create "${walletSetName}" (createWalletSet) → print id for .env`
    }`,
  );
  console.log(`  wallets total  : ${WALLET_NAMES.length}  (${WALLET_NAMES.join(", ")})`);
  console.log(`  already in roster (skip) : ${existing.size ? [...existing].join(", ") : "—"}`);
  console.log(
    `  missing → listWallets(refId) then createWallets(count=${missing.length}) : ${
      missing.length ? missing.join(", ") : "—"
    }`,
  );
  console.log(
    `  API calls      : ${missing.length === 0 && (envSetId || roster.walletSetId) ? "1 (getWalletSet) — roster complete" : `1 wallet-set + ${missing.length} listWallets + ${missing.length ? 1 : 0} createWallets`}`,
  );
  return { roster, walletSetName, envSetId };
}

async function main() {
  const { roster, walletSetName, envSetId } = plan();

  if (flags["dry-run"]) {
    const envCheck = CircleEnvSchema.safeParse({
      CIRCLE_API_KEY: process.env.CIRCLE_API_KEY || undefined,
      CIRCLE_ENTITY_SECRET: process.env.CIRCLE_ENTITY_SECRET || undefined,
      CIRCLE_WALLET_SET_NAME: walletSetName,
    });
    console.log(
      `  env            : ${envCheck.success ? "CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET present" : "missing (fine for --dry-run)"}`,
    );
    console.log("\n--dry-run: no Circle API calls made.");
    return;
  }
  if (!flags.yes) {
    console.error("\nRefusing to call Circle without --yes (or use --dry-run to preview).");
    process.exit(1);
  }

  const env = parseCircleEnv(process.env); // throws naming missing vars, never values
  const client = createCircleClient(env);

  console.log("\nLIVE run against Circle (Testnet API key)…");
  const { walletSetId, created: setCreated } = await ensureWalletSet(client, walletSetName, {
    walletSetId: envSetId,
    rosterWalletSetId: roster.walletSetId,
    log,
  });
  if (roster.walletSetId && roster.walletSetId !== walletSetId) {
    throw new Error(
      `roster.json walletSetId ${roster.walletSetId} != ${walletSetId}; refusing to mix sets`,
    );
  }
  roster.walletSetId = walletSetId;
  writeRoster(roster); // persist set id early so a later crash is recoverable

  const { wallets, created, recovered } = await ensureRosterWallets(client, walletSetId, roster, {
    log,
  });
  roster.wallets = wallets;
  writeRoster(roster);

  console.log("\nDone.");
  console.log(
    `  wallet set : ${walletSetId}${setCreated ? "  (NEW — set CIRCLE_WALLET_SET_ID in .env)" : ""}`,
  );
  console.log(`  created    : ${created.length ? created.join(", ") : "—"}`);
  console.log(`  recovered  : ${recovered.length ? recovered.join(", ") : "—"}`);
  console.log(`  unchanged  : ${WALLET_NAMES.length - created.length - recovered.length}`);
  for (const w of wallets) console.log(`  ${w.name.padEnd(6)} ${w.address}  ${w.walletId}`);
  console.log(
    `\nWrote ${DEFAULT_ROSTER_PATH} — commit it. Fund the mayor at https://faucet.circle.com (ARC-TESTNET).`,
  );
}

main().catch((e: unknown) => {
  console.error(`\nsetup-wallets failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
