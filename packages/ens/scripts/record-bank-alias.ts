#!/usr/bin/env tsx
// M2.4 — register bank.botanica.eth and linkToNode → ada.botanica.eth records
// (hackathon PermissionedResolver inode alias; ROLE_LINK).
//
//   pnpm --filter @agent-town/ens record-bank-alias            # --dry-run
//   pnpm --filter @agent-town/ens record-bank-alias -- --dry-run
//   pnpm --filter @agent-town/ens record-bank-alias -- --broadcast
//
// Default is dry-run (eth_call only). --broadcast is the only write path.
// Orchestrator broadcasts after review; this PR does not. Never persist tokenIds (R3).
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AGENT_NAMES, type AgentName } from "@agent-town/shared";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  isAddress,
  type Account,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { townRegistrarAbi } from "../src/abi/townRegistrar.js";
import { townRegistryAbi } from "../src/abi/townRegistry.js";
import { townResolverAbi } from "../src/abi/townResolver.js";
import { universalResolverAbi } from "../src/abi/universalResolver.js";
import { SEPOLIA_CHAIN_ID, addresses } from "../src/deployments.js";
import { labelhashOf } from "../src/factory.js";
import {
  BANK_LABEL,
  COIN_TYPE_ARC,
  COIN_TYPE_ETH,
  ROLE_LINK,
  TREASURER_LABEL,
  buildBankAliasPlan,
  decodeResolvedAddress,
  encodeResolveAddr,
  type BankAliasPlan,
} from "../src/records.js";

const MODES = ["--dry-run", "--broadcast"] as const;
type Mode = (typeof MODES)[number];

const READONLY_RPC_FALLBACK = "https://ethereum-sepolia-rpc.publicnode.com";
const FAUCET_URL = "https://sepoliafaucet.com";
const TOWN_FILE = fileURLToPath(new URL("../town.json", import.meta.url));
const ROSTER_FILE = fileURLToPath(new URL("../../circle/roster.json", import.meta.url));
const REPO_ROOT_ENV = fileURLToPath(new URL("../../../.env", import.meta.url));
const GAS_BUDGET = 1_500_000n;
const UNIVERSAL = addresses.UpgradableUniversalResolverProxy;

interface TownFile {
  chainId: number;
  label: string;
  contracts: { TownRegistry: Address; TownResolver: Address; TownRegistrar?: Address };
}

function loadEnv(): void {
  for (const p of [REPO_ROOT_ENV, ".env"]) {
    try {
      if (existsSync(p)) process.loadEnvFile(p);
    } catch {
      /* ignore */
    }
  }
}

function parseMode(argv: string[]): Mode {
  const flags = argv.filter((a) => a.startsWith("--") && a !== "--");
  const unknown = flags.filter((a) => !(MODES as readonly string[]).includes(a));
  if (unknown.length) fail(`unknown flag ${unknown.join(" ")} — use ${MODES.join(" | ")}`);
  const found = flags.filter((a): a is Mode => (MODES as readonly string[]).includes(a));
  if (found.length > 1) fail(`pick exactly one of ${MODES.join(" | ")}`);
  return found[0] ?? "--dry-run";
}

function fail(msg: string): never {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

function describeRevert(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? revert.signature ?? "unknown";
      const args = revert.data?.args?.map(String).join(", ") ?? "";
      return `${name}(${args})`;
    }
    return err.shortMessage;
  }
  return String(err);
}

function loadTown(): TownFile {
  if (!existsSync(TOWN_FILE)) fail(`missing ${TOWN_FILE} — run M2.1 first`);
  const raw = JSON.parse(readFileSync(TOWN_FILE, "utf8")) as TownFile;
  if (!isAddress(raw.contracts.TownRegistry) || !isAddress(raw.contracts.TownResolver)) {
    fail("town.json is missing TownRegistry / TownResolver");
  }
  return raw;
}

function loadWallets(): Record<AgentName, Address> {
  if (!existsSync(ROSTER_FILE)) fail(`missing ${ROSTER_FILE} — run M1.3 setup-wallets`);
  const raw = JSON.parse(readFileSync(ROSTER_FILE, "utf8")) as {
    wallets: { name: string; address: string }[];
  };
  const out = {} as Record<AgentName, Address>;
  for (const n of AGENT_NAMES) {
    const w = raw.wallets.find((x) => x.name === n);
    if (!w || !isAddress(w.address, { strict: false })) fail(`roster.json has no wallet for ${n}`);
    out[n] = w.address as Address;
  }
  return out;
}

async function main(): Promise<void> {
  loadEnv();
  const mode = parseMode(process.argv.slice(2));
  const write = mode === "--broadcast";
  if (write && process.env.ALLOW_BROADCAST !== "true") {
    fail("refusing --broadcast: set ALLOW_BROADCAST=true (this PR is dry-run only)");
  }

  const town = loadTown();
  const label = (process.env.ENS_TOWN_NAME ?? town.label ?? "botanica").trim().toLowerCase();
  const registryAddr = (process.env.ENS_TOWN_REGISTRY as Address) || town.contracts.TownRegistry;
  const resolverAddr = (process.env.ENS_TOWN_RESOLVER as Address) || town.contracts.TownResolver;
  const registrarAddr = ((process.env.ENS_TOWN_REGISTRAR || town.contracts.TownRegistrar || "") as Address) || "";
  if (!registrarAddr || !isAddress(registrarAddr)) fail("TownRegistrar missing — run M2.2 / M2.3 first");

  const rpcUrl = process.env.SEPOLIA_RPC_URL?.trim() || (write ? "" : READONLY_RPC_FALLBACK);
  if (!rpcUrl) fail("SEPOLIA_RPC_URL is required for --broadcast (fallback RPC is read-only)");

  const pk = process.env.ENS_TREASURER_PRIVATE_KEY?.trim();
  const account = pk ? privateKeyToAccount(pk as Hex) : undefined;
  if (write && !account) fail("ENS_TREASURER_PRIVATE_KEY is required for --broadcast");

  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  if (chainId !== SEPOLIA_CHAIN_ID)
    fail(`RPC chainId ${chainId} != ${SEPOLIA_CHAIN_ID} (Sepolia) — refusing (R2)`);

  const wallets = loadWallets();
  const adaWallet = wallets[TREASURER_LABEL];
  const registry = { address: registryAddr, abi: townRegistryAbi } as const;
  const resolver = { address: resolverAddr, abi: townResolverAbi } as const;
  const registrarC = { address: registrarAddr, abi: townRegistrarAbi } as const;
  const ur = { address: UNIVERSAL, abi: universalResolverAbi } as const;

  const registrarOwner = await publicClient.readContract({
    ...registrarC,
    functionName: "owner",
  });
  const adaState = await publicClient.readContract({
    ...registry,
    functionName: "getState",
    args: [labelhashOf(TREASURER_LABEL)],
  });
  if (adaState.status !== 2) fail(`${TREASURER_LABEL}.${label}.eth is not REGISTERED — run M2.3 first`);
  const nameOwner = adaState.latestOwner;
  const signer: Address = account?.address ?? registrarOwner;

  const plan = buildBankAliasPlan({
    townLabel: label,
    owner: nameOwner,
    treasurerWallet: adaWallet,
  });

  console.log(`\n== Agent Town · record alias bank.${label}.eth → ${TREASURER_LABEL}.${label}.eth · ${mode}`);
  console.log(`chain              sepolia (${chainId})   rpc: ${rpcUrl}`);
  console.log(`TownRegistry       ${registryAddr}`);
  console.log(`TownResolver       ${resolverAddr}`);
  console.log(`TownRegistrar      ${registrarAddr}`);
  console.log(`UniversalResolver  ${UNIVERSAL}  (UpgradableUniversalResolverProxy)`);
  console.log(`alias              true inode linkToNode (not addr copy; not namechain setAlias)`);
  console.log(`\n-- treasurer (labelhash, not tokenId — R3)`);
  console.log(`label              ${TREASURER_LABEL}.${label}.eth`);
  console.log(`labelhash (anyId)  0x${labelhashOf(TREASURER_LABEL).toString(16).padStart(64, "0")}`);
  console.log(`owner              ${nameOwner}  (live M2.3 register owner = Arc wallet)`);
  console.log(`Arc wallet         ${adaWallet}`);
  console.log(
    `tokenId (live, NOT persisted — R3)  ${adaState.tokenId}`,
  );

  console.log(`\n-- signer (TownRegistrar.onlyOwner + resolver ROLE_LINK)`);
  console.log(
    `address            ${signer}${account ? "" : "  (no key — simulating as registrar.owner)"}`,
  );
  console.log(`registrar.owner    ${registrarOwner}`);

  await logRoles(publicClient, resolver, signer, registrarAddr);
  await logRecordIds(publicClient, resolver, plan);
  logAliasPlan(plan);
  await logResolve(publicClient, ur, plan, resolverAddr);

  await simulateAlias(publicClient, plan, registry, resolver, registrarC, signer);

  if (!write) {
    console.log(`\nNothing was broadcast. After review, orchestrator:`);
    console.log(
      `  ALLOW_BROADCAST=true pnpm --filter @agent-town/ens record-bank-alias -- --broadcast`,
    );
    console.log(
      `  ALLOW_BROADCAST=true forge script script/RecordBankAlias.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --evm-version cancun`,
    );
    console.log(
      `EXIT: UR (${UNIVERSAL}) resolves bank.${label}.eth identically to ${TREASURER_LABEL}.${label}.eth for addr(2152525650) and addr(60) → ${adaWallet}`,
    );
    return;
  }

  if (!account) fail("signer required");
  await broadcastAlias(publicClient, account, plan, registry, resolver, registrarC);
  await logResolve(publicClient, ur, plan, resolverAddr);
}

async function logRoles(
  publicClient: ReturnType<typeof createPublicClient>,
  resolver: { address: Address; abi: typeof townResolverAbi },
  signer: Address,
  registrar: Address,
): Promise<void> {
  console.log(`\n-- ROLE_LINK (${ROLE_LINK}) on TownResolver ROOT`);
  try {
    const has = await publicClient.readContract({
      ...resolver,
      functionName: "hasRoles",
      args: [0n, ROLE_LINK, signer],
    });
    console.log(`    signer has ROLE_LINK     ${has ? "✓" : "✗"}`);
    if (!has) fail("signer lacks ROLE_LINK — treasurer EOA must hold it (resolver init ALL_ROLES)");
  } catch (err) {
    console.log(`    signer has ROLE_LINK     ✗ ${describeRevert(err)}`);
  }
  try {
    const hasReg = await publicClient.readContract({
      ...resolver,
      functionName: "hasRoles",
      args: [0n, ROLE_LINK, registrar],
    });
    console.log(`    TownRegistrar ROLE_LINK  ${hasReg}  (link is sent by treasurer EOA, not registrar)`);
  } catch (err) {
    console.log(`    TownRegistrar ROLE_LINK  ✗ ${describeRevert(err)}`);
  }
}

async function logRecordIds(
  publicClient: ReturnType<typeof createPublicClient>,
  resolver: { address: Address; abi: typeof townResolverAbi },
  plan: BankAliasPlan,
): Promise<void> {
  console.log(`\n-- resolver record ids (not tokenIds; printed only)`);
  try {
    const adaId = await publicClient.readContract({
      ...resolver,
      functionName: "getRecordId",
      args: [plan.treasurerNode],
    });
    console.log(`    getRecordId(${plan.treasurerEns})  ${adaId}`);
  } catch (err) {
    console.log(`    getRecordId(ada)  ✗ ${describeRevert(err)}`);
  }
  try {
    const bankId = await publicClient.readContract({
      ...resolver,
      functionName: "getRecordId",
      args: [plan.bankNode],
    });
    console.log(`    getRecordId(${plan.bankEns}) ${bankId}  (0 until first write or link)`);
  } catch (err) {
    console.log(`    getRecordId(bank) ✗ ${describeRevert(err)}`);
  }
}

function logAliasPlan(plan: BankAliasPlan): void {
  console.log(`\n-- alias plan`);
  console.log(`    register(${BANK_LABEL}, owner=${plan.owner}, role=Treasurer)`);
  console.log(`    register calldata   ${plan.calls.register}`);
  console.log(`    linkToNode(${plan.bankEns} → node ${plan.treasurerEns})`);
  console.log(`    link calldata       ${plan.calls.linkToNode}`);
  console.log(`    bank dns            ${plan.bankDns}`);
  console.log(`    ada node            ${plan.treasurerNode}`);
}

async function resolveAddr(
  publicClient: ReturnType<typeof createPublicClient>,
  ur: { address: Address; abi: typeof universalResolverAbi },
  dns: Hex,
  calldata: Hex,
): Promise<{ raw: Hex; addr?: Address; err?: string }> {
  try {
    const [result] = await publicClient.readContract({
      ...ur,
      functionName: "resolve",
      args: [dns, calldata],
    });
    return { raw: result, addr: decodeResolvedAddress(result) };
  } catch (err) {
    return { raw: "0x", err: describeRevert(err) };
  }
}

async function logResolve(
  publicClient: ReturnType<typeof createPublicClient>,
  ur: { address: Address; abi: typeof universalResolverAbi },
  plan: BankAliasPlan,
  townResolver: Address,
): Promise<void> {
  console.log(`\n-- UniversalResolverV2.resolve (decode 194-byte ABI addr; do not treat as empty)`);
  for (const [tag, dns, node] of [
    [plan.treasurerEns, plan.treasurerDns, plan.treasurerNode],
    [plan.bankEns, plan.bankDns, plan.bankNode],
  ] as const) {
    try {
      const found = await publicClient.readContract({
        ...ur,
        functionName: "findResolver",
        args: [dns],
      });
      const got = found[0];
      const match =
        got.toLowerCase() === townResolver.toLowerCase() ? "✓ TownResolver" : `got ${got}`;
      console.log(`    ${tag}  findResolver  ${got}  ${match}`);
    } catch (err) {
      console.log(`    ${tag}  findResolver  ✗ ${describeRevert(err)}`);
    }
    const arc = await resolveAddr(publicClient, ur, dns, encodeResolveAddr(node, COIN_TYPE_ARC));
    const eth = await resolveAddr(publicClient, ur, dns, encodeResolveAddr(node, COIN_TYPE_ETH));
    const fmt = (r: { raw: Hex; addr?: Address; err?: string }) =>
      r.err
        ? `✗ ${r.err}`
        : `${r.addr ?? "(empty — expected for bank until broadcast)"}  rawLen=${r.raw.length}`;
    console.log(`      addr(2152525650)  ${fmt(arc)}`);
    console.log(`      addr(60)          ${fmt(eth)}`);
  }
  const adaArc = await resolveAddr(
    publicClient,
    ur,
    plan.treasurerDns,
    encodeResolveAddr(plan.treasurerNode, COIN_TYPE_ARC),
  );
  const adaEth = await resolveAddr(
    publicClient,
    ur,
    plan.treasurerDns,
    encodeResolveAddr(plan.treasurerNode, COIN_TYPE_ETH),
  );
  const bankArc = await resolveAddr(
    publicClient,
    ur,
    plan.bankDns,
    encodeResolveAddr(plan.bankNode, COIN_TYPE_ARC),
  );
  const bankEth = await resolveAddr(
    publicClient,
    ur,
    plan.bankDns,
    encodeResolveAddr(plan.bankNode, COIN_TYPE_ETH),
  );
  if (adaArc.addr) {
    const same =
      bankArc.addr?.toLowerCase() === adaArc.addr.toLowerCase() &&
      bankEth.addr?.toLowerCase() === adaEth.addr?.toLowerCase();
    console.log(
      `\n    EXIT check  bank == ada wallet ${adaArc.addr}  ${same ? "✓ identical" : "pending broadcast (bank empty or unlinked)"}`,
    );
  }
}

async function simulateAlias(
  publicClient: ReturnType<typeof createPublicClient>,
  plan: BankAliasPlan,
  registry: { address: Address; abi: typeof townRegistryAbi },
  resolver: { address: Address; abi: typeof townResolverAbi },
  registrarC: { address: Address; abi: typeof townRegistrarAbi },
  signer: Address,
): Promise<void> {
  console.log(`\n-- dry-run simulations (eth_call; NOTHING is broadcast)`);
  const anyId = labelhashOf(BANK_LABEL);
  const state = await publicClient.readContract({
    ...registry,
    functionName: "getState",
    args: [anyId],
  });
  if (state.status === 2) {
    console.log(
      `    bank.getState(labelhash) tokenId ${state.tokenId} (live, NOT persisted — R3) already REGISTERED`,
    );
  }
  try {
    const { result } = await publicClient.simulateContract({
      ...registrarC,
      functionName: "register",
      args: [BANK_LABEL, plan.owner, plan.registrarRole],
      account: signer,
    });
    console.log(
      `    register(${BANK_LABEL})  ✓ would succeed → tokenId ${result} (not persisted — R3)`,
    );
  } catch (err) {
    console.log(`    register(${BANK_LABEL})  ✗ ${describeRevert(err)}`);
  }
  try {
    await publicClient.simulateContract({
      ...resolver,
      functionName: "linkToNode",
      args: [plan.bankDns, plan.treasurerNode],
      account: signer,
    });
    console.log(`    linkToNode(bank → ada)  ✓ would succeed`);
  } catch (err) {
    console.log(`    linkToNode(bank → ada)  ✗ ${describeRevert(err)}`);
  }
}

async function broadcastAlias(
  publicClient: ReturnType<typeof createPublicClient>,
  account: Account,
  plan: BankAliasPlan,
  registry: { address: Address; abi: typeof townRegistryAbi },
  resolver: { address: Address; abi: typeof townResolverAbi },
  registrarC: { address: Address; abi: typeof townRegistrarAbi },
): Promise<void> {
  const signer = account.address;
  const ethBalance = await publicClient.getBalance({ address: signer });
  if (ethBalance === 0n) fail(`treasurer ${signer} has 0 Sepolia ETH — fund it: ${FAUCET_URL}`);
  const fees = await publicClient.estimateFeesPerGas().catch(() => undefined);
  const maxFee = fees?.maxFeePerGas ?? fees?.gasPrice;
  if (maxFee !== undefined) {
    const needed = GAS_BUDGET * maxFee;
    console.log(
      `\ngas check          budget ${GAS_BUDGET} gas × maxFee ${maxFee} wei = ${formatEther(needed)} ETH  (have ${formatEther(ethBalance)})`,
    );
    if (ethBalance < needed) fail(`need ~${formatEther(needed)} ETH — top up: ${FAUCET_URL}`);
  }

  const rpcUrl = process.env.SEPOLIA_RPC_URL?.trim();
  if (!rpcUrl) fail("SEPOLIA_RPC_URL is required for --broadcast");
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });

  const anyId = labelhashOf(BANK_LABEL);
  const before = await publicClient.readContract({
    ...registry,
    functionName: "getState",
    args: [anyId],
  });
  if (before.status !== 2) {
    console.log(`\n-- broadcasting register(${BANK_LABEL}, owner=${plan.owner}, role=Treasurer)`);
    const { result } = await publicClient.simulateContract({
      ...registrarC,
      functionName: "register",
      args: [BANK_LABEL, plan.owner, plan.registrarRole],
      account: walletClient.account,
    });
    console.log(`    simulate tokenId  ${result}  (discarded — re-read via labelhash, R3)`);
    await send(publicClient, walletClient, {
      ...registrarC,
      functionName: "register",
      args: [BANK_LABEL, plan.owner, plan.registrarRole],
    });
  } else {
    console.log(`\n-- ${BANK_LABEL} already REGISTERED; skipping register`);
  }
  const live = await publicClient.readContract({
    ...registry,
    functionName: "getState",
    args: [anyId],
  });
  console.log(
    `    getState(labelhash) tokenId ${live.tokenId}  ← printed only, never persisted (R3)`,
  );
  console.log(`-- broadcasting linkToNode(${plan.bankEns} → ${plan.treasurerEns})`);
  await send(publicClient, walletClient, {
    ...resolver,
    functionName: "linkToNode",
    args: [plan.bankDns, plan.treasurerNode],
  });
  console.log(`\nLinked ${plan.bankEns} → ${plan.treasurerEns} record. tokenIds printed only (R3).`);
}

async function send(
  publicClient: ReturnType<typeof createPublicClient>,
  walletClient: WalletClient,
  args: Parameters<typeof publicClient.simulateContract>[0],
): Promise<Hex> {
  const { request } = await publicClient.simulateContract({
    ...args,
    account: walletClient.account,
  });
  const hash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") fail(`tx reverted: ${hash}`);
  console.log(`    tx                ${hash}`);
  return hash;
}

main().catch((err) => {
  console.error(err instanceof BaseError ? err.shortMessage : err);
  process.exit(1);
});
