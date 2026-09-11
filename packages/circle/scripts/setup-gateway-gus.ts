// M9.1 — one SCA for gus on ETH-SEPOLIA in the existing Circle wallet set.
// Does NOT touch roster.json (Arc gus 0x55911428… stays). Persists gateway-gus.json.
// Usage (from repo root; load absolute ../../.env from packages/circle):
//   pnpm --filter @agent-town/circle setup-gateway-gus
//   pnpm --filter @agent-town/circle setup-gateway-gus --yes
// Idempotent: listWallets(refId=gus-eth-sepolia) then createWallets(count=1) if missing.
// Never prints secrets. Default is dry-run; refuses Circle create without --yes.
import { parseArgs } from "node:util";
import {
  CircleEnvSchema,
  DEFAULT_GATEWAY_GUS_PATH,
  ETH_SEPOLIA_BLOCKCHAIN,
  EXISTING_WALLET_SET_ID,
  GUS_SEPOLIA_REF_ID,
  buildGatewayGusPlan,
  createCircleClient,
  ensureGatewayGusWallet,
  ensureWalletSet,
  formatGatewayGusPlan,
  gatewayWantsLive,
  parseCircleEnv,
  pinWalletSetId,
  readGatewayGus,
  readRoster,
  requestCircleFaucet,
  toGatewayGusArtifact,
  writeGatewayGus,
  type Logger,
} from "../src/index.js";

const { values: flags } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
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
  const envSetId = process.env.CIRCLE_WALLET_SET_ID || roster.walletSetId || null;
  const p = buildGatewayGusPlan({
    artifact: readGatewayGus(),
    artifactPath: DEFAULT_GATEWAY_GUS_PATH,
    envSetId,
  });
  console.log(formatGatewayGusPlan(p));
  return { roster, envSetId, plan: p };
}

async function main() {
  const { roster, envSetId } = plan();

  if (!gatewayWantsLive({ yes: flags.yes, dryRun: flags["dry-run"] })) {
    const envCheck = CircleEnvSchema.safeParse({
      CIRCLE_API_KEY: process.env.CIRCLE_API_KEY || undefined,
      CIRCLE_ENTITY_SECRET: process.env.CIRCLE_ENTITY_SECRET || undefined,
    });
    console.log(
      `  env            : ${envCheck.success ? "CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET present" : "missing (fine for --dry-run)"}`,
    );
    console.log("\nRefusing to call Circle without --yes (default is --dry-run).");
    console.log("After --yes: fund at https://faucet.circle.com (ETH-SEPOLIA USDC + native ETH).");
    return;
  }

  const walletSetId = pinWalletSetId(envSetId);
  if (roster.walletSetId && roster.walletSetId !== walletSetId) {
    throw new Error(
      `roster.json walletSetId ${roster.walletSetId} != pinned ${walletSetId}; refusing to mix sets`,
    );
  }

  const env = parseCircleEnv(process.env);
  const client = createCircleClient(env);

  console.log("\nLIVE run against Circle (Testnet API key)…");
  const { walletSetId: verified, created: setCreated } = await ensureWalletSet(
    client,
    env.CIRCLE_WALLET_SET_NAME,
    { walletSetId, log },
  );
  if (setCreated) throw new Error("refusing to create a new wallet set");
  if (verified !== EXISTING_WALLET_SET_ID) {
    throw new Error(`getWalletSet returned ${verified}; expected ${EXISTING_WALLET_SET_ID}`);
  }

  const { walletId, address, created, recovered } = await ensureGatewayGusWallet(
    client,
    verified,
    { log },
  );
  const artifact = {
    ...toGatewayGusArtifact({ walletSetId: verified, walletId, address }),
    ...(readGatewayGus() ?? {}),
    walletId,
    address,
    walletSetId: verified,
  };
  writeGatewayGus(artifact);

  console.log("\nDone.");
  console.log(`  wallet set : ${verified}`);
  console.log(`  blockchain : ${ETH_SEPOLIA_BLOCKCHAIN}`);
  console.log(`  refId      : ${GUS_SEPOLIA_REF_ID}`);
  console.log(`  created    : ${created ? "yes" : "—"}`);
  console.log(`  recovered  : ${recovered ? "yes" : "—"}`);
  console.log(`  address    : ${address}`);
  console.log(`  walletId   : ${walletId}`);
  console.log(`  wrote      : ${DEFAULT_GATEWAY_GUS_PATH}`);
  console.log("  Arc gus in roster.json was not modified.");

  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) {
    console.log("\nBLOCKED: faucet — CIRCLE_API_KEY missing after create (unexpected).");
    return;
  }
  console.log("\nRequesting Circle faucet drip (ETH-SEPOLIA USDC + native)…");
  const faucet = await requestCircleFaucet({
    apiKey,
    address,
    blockchain: ETH_SEPOLIA_BLOCKCHAIN,
  });
  writeGatewayGus({ ...artifact, faucet: { ok: faucet.ok, status: faucet.status, detail: faucet.detail } });
  if (faucet.ok) {
    console.log(`  faucet      : ok (${faucet.status}) ${faucet.detail}`);
    console.log("  next        : pnpm --filter @agent-town/circle gateway-deposit --yes");
    return;
  }
  console.log(`  faucet      : ${faucet.status} ${faucet.detail}`);
  if (faucet.status === 403) {
    console.log("\nBLOCKED: faucet — Circle faucet 403. Stop here; film Arc-only. Do not grind.");
    return;
  }
  console.log("\nBLOCKED: faucet — drip failed. Open the PR with wallet created.");
}

main().catch((e: unknown) => {
  console.error(`\nsetup-gateway-gus failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
