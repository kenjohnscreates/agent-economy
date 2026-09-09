#!/usr/bin/env tsx
// M4.6 — map repay/default → ENS treasurer writes (credit-score, reviews, revoke).
//
//   pnpm --filter @agent-town/ens ens-side-effects -- --dry-run \
//     --agent fay --kind default --tick 7 --amount 1
//   pnpm --filter @agent-town/ens ens-side-effects -- --broadcast \
//     --agent fay --kind default --tick 7 --amount 1
//
// Default is dry-run (eth_call / simulateContract only). --broadcast is refused
// unless ALLOW_BROADCAST=true. Orchestrator broadcasts after review; this PR does not.
// Treasurer signer only (ENS_TREASURER_PRIVATE_KEY). Never persist tokenIds (R3).
//
// Live Arc (M1.6 treasury-e2e): merchant **bo** repaid loan #1 then defaulted loan #2
// (0.2 USDC). Do not invent gus. PRD §12 demo worker default is fay (1 USDC, tick 7).
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AGENT_NAMES, ENS_KEYS } from "@agent-town/shared";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  type Account,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { townRegistrarAbi } from "../src/abi/townRegistrar.js";
import { SEPOLIA_CHAIN_ID, addresses } from "../src/deployments.js";
import { encodeSetText } from "../src/records.js";
import { normalizeAgentName } from "../src/client.js";
import {
  applyLoanOutcome,
  formatOutcomeNote,
  requireBroadcastGate,
  type LoanOutcome,
  type OutcomeKind,
} from "../src/sideEffects.js";
import { town, townAddresses } from "../src/town.js";

const MODES = ["--dry-run", "--broadcast"] as const;
type Mode = (typeof MODES)[number];

const READONLY_RPC_FALLBACK = "https://ethereum-sepolia-rpc.publicnode.com";
const ROSTER_FILE = fileURLToPath(new URL("../../circle/roster.json", import.meta.url));
const REPO_ROOT_ENV = fileURLToPath(new URL("../../../.env", import.meta.url));
const UNIVERSAL = addresses.UpgradableUniversalResolverProxy;
const VALUE_FLAGS = ["--agent", "--kind", "--tick", "--amount", "--loan-id", "--prior-defaults"] as const;

function loadEnv(): void {
  for (const p of [REPO_ROOT_ENV, ".env"]) {
    try {
      if (existsSync(p)) process.loadEnvFile(p);
    } catch {
      /* ignore */
    }
  }
}

function fail(msg: string): never {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

function parseMode(argv: string[]): Mode {
  const flags = argv.filter((a) => a.startsWith("--") && a !== "--");
  const unknown = flags.filter(
    (a) => !(MODES as readonly string[]).includes(a) && !(VALUE_FLAGS as readonly string[]).includes(a),
  );
  if (unknown.length) fail(`unknown flag ${unknown.join(" ")} — use ${MODES.join(" | ")} and ${VALUE_FLAGS.join(" ")}`);
  const found = flags.filter((a): a is Mode => (MODES as readonly string[]).includes(a));
  if (found.length > 1) fail(`pick exactly one of ${MODES.join(" | ")}`);
  return found[0] ?? "--dry-run";
}

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (!v || v.startsWith("--")) fail(`${name} needs a value`);
  return v;
}

function parseOutcome(argv: string[]): LoanOutcome {
  const agent = flagValue(argv, "--agent") ?? "fay";
  const kindRaw = (flagValue(argv, "--kind") ?? "default").toLowerCase();
  if (kindRaw !== "repay" && kindRaw !== "default") fail(`--kind must be repay|default`);
  const tickRaw = flagValue(argv, "--tick") ?? (kindRaw === "default" ? "7" : "5");
  const tick = Number(tickRaw);
  if (!Number.isInteger(tick) || tick < 0) fail(`--tick must be a nonnegative integer`);
  const amountUsdc = flagValue(argv, "--amount") ?? (kindRaw === "default" ? "1" : "0.3");
  const loanId = flagValue(argv, "--loan-id");
  const priorRaw = flagValue(argv, "--prior-defaults");
  const priorDefaults = priorRaw != null ? Number(priorRaw) : undefined;
  if (priorDefaults != null && (!Number.isInteger(priorDefaults) || priorDefaults < 0)) {
    fail(`--prior-defaults must be a nonnegative integer`);
  }
  return {
    agent,
    kind: kindRaw as OutcomeKind,
    tick,
    amountUsdc,
    ...(loanId != null ? { loanId } : {}),
    ...(priorDefaults != null ? { priorDefaults } : {}),
  };
}

function loadRosterWallets(): Address[] {
  if (!existsSync(ROSTER_FILE)) return [];
  const raw = JSON.parse(readFileSync(ROSTER_FILE, "utf8")) as {
    wallets: { name: string; address: string }[];
  };
  const out: Address[] = [];
  for (const n of AGENT_NAMES) {
    const w = raw.wallets.find((x) => x.name === n);
    if (w && isAddress(w.address, { strict: false })) out.push(w.address as Address);
  }
  return out;
}

async function main(): Promise<void> {
  loadEnv();
  const argv = process.argv.slice(2);
  const mode = parseMode(argv);
  const write = mode === "--broadcast";
  requireBroadcastGate(write);

  const outcome = parseOutcome(argv);
  const n = normalizeAgentName(outcome.agent);
  const rpcUrl = process.env.SEPOLIA_RPC_URL?.trim() || (write ? "" : READONLY_RPC_FALLBACK);
  if (!rpcUrl) fail("SEPOLIA_RPC_URL is required for --broadcast (fallback RPC is read-only)");

  const pk = process.env.ENS_TREASURER_PRIVATE_KEY?.trim();
  const keyAccount = pk ? privateKeyToAccount(pk as Hex) : undefined;
  if (write && !keyAccount) fail("ENS_TREASURER_PRIVATE_KEY is required for --broadcast");

  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  if (chainId !== SEPOLIA_CHAIN_ID)
    fail(`RPC chainId ${chainId} != ${SEPOLIA_CHAIN_ID} (Sepolia) — refusing (R2)`);

  const registrar = townAddresses.TownRegistrar;
  const treasurerOnChain = (await publicClient.readContract({
    address: registrar,
    abi: townRegistrarAbi,
    functionName: "owner",
  })) as Address;

  const account: Account | Address = keyAccount ?? treasurerOnChain;
  const walletClient =
    keyAccount != null
      ? createWalletClient({ chain: sepolia, transport: http(rpcUrl), account: keyAccount })
      : undefined;

  console.log(`\n== Agent Town · ENS side-effects · ${mode}`);
  console.log(`town              ${town.name}`);
  console.log(`TownRegistrar     ${registrar}`);
  console.log(`TownResolver       ${townAddresses.TownResolver}`);
  console.log(`UniversalResolver  ${UNIVERSAL}`);
  console.log(`agent              ${n.ensName}`);
  console.log(`kind               ${outcome.kind}  tick=${outcome.tick}  amount=${outcome.amountUsdc} USDC`);
  if (outcome.loanId != null) console.log(`loanId             ${outcome.loanId}`);
  console.log(`note               ${formatOutcomeNote(outcome)}`);
  console.log(`signer             ${typeof account === "string" ? account : account.address}${keyAccount ? "" : "  (owner() — no key; simulate only)"}`);
  console.log(`treasurer owner()  ${treasurerOnChain}`);

  const result = await applyLoanOutcome(outcome, {
    publicClient,
    walletClient,
    account,
    broadcast: write,
    treasurer: treasurerOnChain,
    forbiddenSigners: loadRosterWallets(),
  });

  const { plan } = result;
  console.log(`\n-- plan`);
  console.log(`ledgerKey          ${plan.ledgerKey}`);
  console.log(`action             ${plan.action}${plan.skipped ? `  (${plan.reason})` : ""}`);
  if (plan.newScore != null) console.log(`town.credit-score  ${plan.newScore}`);
  if (plan.review) console.log(`town.reviews       ${JSON.stringify(plan.review)}`);
  console.log(`revoke             ${plan.revoke}`);
  console.log(`tokenId            (never stored — revoke re-reads getState)`);

  if (plan.newScore != null) {
    const data = encodeSetText(n.dnsName, ENS_KEYS.creditScore, String(plan.newScore));
    console.log(`\n-- calldata setText(${ENS_KEYS.creditScore})`);
    console.log(data);
  }
  if (plan.review) {
    // Value is the full JSON array after append; client re-reads live reviews. Show the new entry.
    console.log(`\n-- calldata setText(${ENS_KEYS.reviews})  (new entry; client concatenates live array)`);
    console.log(encodeSetText(n.dnsName, ENS_KEYS.reviews, JSON.stringify([plan.review])));
  }
  if (plan.revoke) {
    console.log(`\n-- revokeName → unregister(live getState tokenId)  (R3: not printed, not stored)`);
  }

  console.log(`\n-- writes`);
  if (result.writes.length === 0) {
    console.log(plan.skipped ? "skipped (idempotent)" : "(none)");
  } else {
    for (const w of result.writes) {
      console.log(w.simulated ? "simulated  (eth_call / simulateContract)" : `broadcast  ${w.hash}`);
    }
  }

  if (write) {
    console.log(`\nEXIT: live Sepolia writes sent as treasurer ${treasurerOnChain}`);
  } else {
    console.log(
      `\nEXIT: dry-run only (no --broadcast). Sample: fay 1st default → score 35 + "${formatOutcomeNote({ kind: "default", amountUsdc: "1", tick: 7 })}". 2nd default → revokeName. M1.6 on-chain default is bo loan #2 (0.2 USDC).`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(`\nens-side-effects failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
