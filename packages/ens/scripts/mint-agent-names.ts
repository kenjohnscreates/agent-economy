#!/usr/bin/env tsx
// M2.3 — mint 8 botanica.eth agent subnames via TownRegistrar and set ARCHITECTURE §4.4
// records (addr Arc coinType + addr 60, agent-context, town.role, avatar).
//
//   pnpm --filter @agent-town/ens mint-agent-names            # --dry-run
//   pnpm --filter @agent-town/ens mint-agent-names -- --dry-run
//   pnpm --filter @agent-town/ens mint-agent-names -- --broadcast
//
// Default is dry-run (eth_call only). --broadcast is the only write path.
// Orchestrator broadcasts after review; this PR does not. Never persist tokenIds (R3).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AGENT_NAMES, type AgentName } from "@agent-town/shared";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  decodeAbiParameters,
  formatEther,
  http,
  isAddress,
  zeroAddress,
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
  DEFAULT_APP_ORIGIN,
  REGISTRY_REGISTRAR_ROLES,
  RESOLVER_REGISTRAR_ROLES,
  buildMintPlan,
  dnsEncodeName,
  type AgentMintPlan,
  type MintPlan,
} from "../src/records.js";

const MODES = ["--dry-run", "--broadcast"] as const;
type Mode = (typeof MODES)[number];

const READONLY_RPC_FALLBACK = "https://ethereum-sepolia-rpc.publicnode.com";
const FAUCET_URL = "https://sepoliafaucet.com";
const TOWN_FILE = fileURLToPath(new URL("../town.json", import.meta.url));
const ROSTER_FILE = fileURLToPath(new URL("../../circle/roster.json", import.meta.url));
const REPO_ROOT_ENV = fileURLToPath(new URL("../../../.env", import.meta.url));
const GAS_BUDGET = 4_000_000n;
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
  const registrarAddr =
    ((process.env.ENS_TOWN_REGISTRAR || town.contracts.TownRegistrar || "") as Address | "") || "";
  const origin = process.env.PUBLIC_APP_URL?.trim() || DEFAULT_APP_ORIGIN;

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
  const registrarForPlan: Address =
    registrarAddr && isAddress(registrarAddr) ? registrarAddr : zeroAddress;
  const plan = buildMintPlan({
    townLabel: label,
    registry: registryAddr,
    resolver: resolverAddr,
    registrar: registrarForPlan,
    wallets,
    origin,
  });

  const parentHash = labelhashOf(label);
  const registry = { address: registryAddr, abi: townRegistryAbi } as const;
  const resolver = { address: resolverAddr, abi: townResolverAbi } as const;
  const ur = { address: UNIVERSAL, abi: universalResolverAbi } as const;

  const [parentState, parentOwner] = await Promise.all([
    publicClient.readContract({
      address: addresses.ETHRegistry,
      abi: townRegistryAbi,
      functionName: "getState",
      args: [parentHash],
    }),
    publicClient.readContract({
      address: addresses.ETHRegistry,
      abi: townRegistryAbi,
      functionName: "getOwner",
      args: [parentHash],
    }),
  ]);
  const signer: Address = account?.address ?? parentOwner;

  console.log(`\n== Agent Town · mint 8 agent subnames · ${mode}`);
  console.log(`chain              sepolia (${chainId})   rpc: ${rpcUrl}`);
  console.log(`TownRegistry       ${registryAddr}`);
  console.log(`TownResolver       ${resolverAddr}`);
  console.log(`TownRegistrar      ${registrarForPlan}`);
  console.log(`UniversalResolver  ${UNIVERSAL}  (UpgradableUniversalResolverProxy)`);
  console.log(`app origin         ${origin}  (avatar / agent-context endpoints)`);

  console.log(`\n-- parent (labelhash, not tokenId — R3)`);
  console.log(`label              ${label}.eth`);
  console.log(`labelhash (anyId)  0x${parentHash.toString(16).padStart(64, "0")}`);
  const statusName =
    ["AVAILABLE", "RESERVED", "REGISTERED"][parentState.status] ?? `?${parentState.status}`;
  console.log(
    `registry status    ${statusName}  owner=${parentOwner}  expiry=${parentState.expiry}`,
  );
  if (parentState.status === 2)
    console.log(`tokenId (live, NOT persisted — R3)  ${parentState.tokenId}`);
  console.log(`\n-- signer (treasurer; TownRegistrar.register is onlyOwner)`);
  console.log(
    `address            ${signer}${account ? "" : "  (no key — simulating as on-chain owner)"}`,
  );

  if (parentState.status !== 2) fail(`${label}.eth is not REGISTERED — run M0.4 / M2.1 first`);

  logGrantPlan(plan, registrarForPlan);
  logMintPlan(plan);
  await logResolvePlan(publicClient, ur, plan, resolverAddr);

  if (registrarForPlan === zeroAddress) {
    console.log(`\nTownRegistrar not set. Deploy first (dry-run):`);
    console.log(
      `  forge script script/DeployTownRegistrar.s.sol --rpc-url $SEPOLIA_RPC_URL --evm-version paris`,
    );
    console.log(
      `Then set ENS_TOWN_REGISTRAR and re-run. Grants + mint calldata are printed above.`,
    );
  } else {
    await simulateMint(publicClient, plan, registry, resolver, registrarForPlan, signer);
  }

  if (!write) {
    console.log(`\nNothing was broadcast. After review, orchestrator:`);
    console.log(
      `  ALLOW_BROADCAST=true forge script script/DeployTownRegistrar.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --evm-version paris`,
    );
    console.log(
      `  ALLOW_BROADCAST=true pnpm --filter @agent-town/ens mint-agent-names -- --broadcast`,
    );
    console.log(
      `EXIT: UniversalResolverV2 (${UNIVERSAL}) resolves each ada|bo|…|hal.${label}.eth → Arc wallet.`,
    );
    return;
  }

  if (registrarForPlan === zeroAddress)
    fail("ENS_TOWN_REGISTRAR / town.json TownRegistrar required for --broadcast");
  if (!account) fail("signer required");
  await broadcastMint(
    publicClient,
    account,
    plan,
    registry,
    resolver,
    registrarForPlan,
    town,
    label,
  );
}

function logGrantPlan(plan: MintPlan, registrar: Address): void {
  console.log(`\n-- EAC grants (treasurer → TownRegistrar; DeployTownRegistrar grant plan)`);
  console.log(`[G1] registry.grantRootRoles(ROLE_REGISTRAR | ROLE_RENEW, registrar)`);
  console.log(`    to                ${plan.registry}`);
  console.log(`    calldata          ${plan.grants.registry}`);
  console.log(
    `[G2] resolver.grantRootRoles(ROLE_SET_TEXT(+ADMIN) | ROLE_SET_ADDRESS(+ADMIN), registrar)`,
  );
  console.log(`    to                ${plan.resolver}`);
  console.log(`    calldata          ${plan.grants.resolver}`);
  if (registrar === zeroAddress) console.log(`    (registrar address 0x0 — replace after deploy)`);
}

function logMintPlan(plan: MintPlan): void {
  console.log(`\n-- mint + records (8 names; owner = Arc Circle wallet)`);
  for (const a of plan.agents) {
    console.log(
      `\n[${a.name}] ${a.ensName}  role=${a.role} (${a.registrarRole})  wallet=${a.wallet}`,
    );
    console.log(`    dns               ${a.dnsName}`);
    console.log(`    register          ${a.calls.register}`);
    console.log(`    setAddress(${2152525650}) ${a.calls.setAddrArc}`);
    console.log(`    setAddress(60)    ${a.calls.setAddrEth}`);
    console.log(`    setText(agent-context)  ${a.calls.setAgentContext.slice(0, 74)}…`);
    console.log(`    setText(town.role=${a.role})`);
    console.log(`    setText(avatar=${a.avatar})`);
    console.log(`    records multicall ${a.calls.recordsMulticall.slice(0, 74)}…`);
  }
}

async function logResolvePlan(
  publicClient: ReturnType<typeof createPublicClient>,
  ur: { address: Address; abi: typeof universalResolverAbi },
  plan: MintPlan,
  townResolver: Address,
): Promise<void> {
  console.log(`\n-- resolve plan (UniversalResolverV2.resolve(dnsEncode, addr(node, coinType)))`);
  for (const a of plan.agents) {
    const dns = dnsEncodeName(a.ensName);
    console.log(
      `    ${a.ensName}  UR.resolve(dns, addr(node, 2152525650)) → ${a.wallet}  (also coinType 60)`,
    );
    try {
      const found = await publicClient.readContract({
        ...ur,
        functionName: "findResolver",
        args: [dns],
      });
      const got = found[0];
      const match =
        got.toLowerCase() === townResolver.toLowerCase() ? "✓ TownResolver" : `got ${got}`;
      console.log(`      findResolver    ${got}  ${match}`);
    } catch (err) {
      console.log(`      findResolver    ✗ ${describeRevert(err)}`);
    }
    try {
      const [result] = await publicClient.readContract({
        ...ur,
        functionName: "resolve",
        args: [dns, a.calls.resolveAddrArc],
      });
      const decoded = decodePackedAddress(result);
      console.log(
        `      resolve(Arc)    ${decoded ?? (result || "(empty — expected until broadcast)")}`,
      );
    } catch (err) {
      console.log(
        `      resolve(Arc)    ✗ ${describeRevert(err)}  (expected until records are set)`,
      );
    }
  }
}

function decodePackedAddress(data: Hex): Address | undefined {
  if (!data || data === "0x") return undefined;
  try {
    if (data.length === 66) {
      const [addr] = decodeAbiParameters([{ type: "address" }], data);
      return addr;
    }
    if (data.length === 42) return data as Address;
    if (data.length === 130) {
      const [inner] = decodeAbiParameters([{ type: "bytes" }], data);
      if (inner.length === 42) return inner as Address;
    }
  } catch {
    /* raw */
  }
  return undefined;
}

async function simulateMint(
  publicClient: ReturnType<typeof createPublicClient>,
  plan: MintPlan,
  registry: { address: Address; abi: typeof townRegistryAbi },
  resolver: { address: Address; abi: typeof townResolverAbi },
  registrar: Address,
  signer: Address,
): Promise<void> {
  console.log(`\n-- dry-run simulations (eth_call; NOTHING is broadcast)`);
  try {
    await publicClient.simulateContract({
      ...registry,
      functionName: "grantRootRoles",
      args: [REGISTRY_REGISTRAR_ROLES, registrar],
      account: signer,
    });
    console.log(`    registry.grantRootRoles  ✓ would succeed`);
  } catch (err) {
    console.log(`    registry.grantRootRoles  ✗ ${describeRevert(err)}`);
  }
  try {
    await publicClient.simulateContract({
      ...resolver,
      functionName: "grantRootRoles",
      args: [RESOLVER_REGISTRAR_ROLES, registrar],
      account: signer,
    });
    console.log(`    resolver.grantRootRoles  ✓ would succeed`);
  } catch (err) {
    console.log(`    resolver.grantRootRoles  ✗ ${describeRevert(err)}`);
  }

  const registrarC = { address: registrar, abi: townRegistrarAbi } as const;
  for (const a of plan.agents) {
    const anyId = labelhashOf(a.name);
    const state = await publicClient.readContract({
      ...registry,
      functionName: "getState",
      args: [anyId],
    });
    if (state.status === 2) {
      console.log(
        `    ${a.name}.getState(labelhash) tokenId ${state.tokenId} (live, NOT persisted — R3) already REGISTERED`,
      );
    }
    try {
      const { result } = await publicClient.simulateContract({
        ...registrarC,
        functionName: "register",
        args: [a.name, a.owner, a.registrarRole],
        account: signer,
      });
      console.log(
        `    register(${a.name})  ✓ would succeed → tokenId ${result} (not persisted — R3)`,
      );
    } catch (err) {
      console.log(`    register(${a.name})  ✗ ${describeRevert(err)}`);
    }
    try {
      await publicClient.simulateContract({
        ...resolver,
        functionName: "multicall",
        args: [
          [
            a.calls.setAddrArc,
            a.calls.setAddrEth,
            a.calls.setAgentContext,
            a.calls.setTownRole,
            a.calls.setAvatar,
          ],
        ],
        account: signer,
      });
      console.log(`    set records(${a.name})  ✓ would succeed`);
    } catch (err) {
      console.log(`    set records(${a.name})  ✗ ${describeRevert(err)}`);
    }
  }
}

async function broadcastMint(
  publicClient: ReturnType<typeof createPublicClient>,
  account: Account,
  plan: MintPlan,
  registry: { address: Address; abi: typeof townRegistryAbi },
  resolver: { address: Address; abi: typeof townResolverAbi },
  registrar: Address,
  town: TownFile,
  label: string,
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
  const registrarC = { address: registrar, abi: townRegistrarAbi } as const;

  console.log(`\n-- broadcasting grants (then re-read parent tokenId via labelhash — R3)`);
  await send(publicClient, walletClient, {
    ...registry,
    functionName: "grantRootRoles",
    args: [REGISTRY_REGISTRAR_ROLES, registrar],
  });
  await send(publicClient, walletClient, {
    ...resolver,
    functionName: "grantRootRoles",
    args: [RESOLVER_REGISTRAR_ROLES, registrar],
  });
  const afterGrant = await publicClient.readContract({
    address: addresses.ETHRegistry,
    abi: townRegistryAbi,
    functionName: "getState",
    args: [labelhashOf(label)],
  });
  console.log(`parent tokenId after grants (NOT persisted — R3)  ${afterGrant.tokenId}`);

  for (const a of plan.agents) {
    await mintOne(publicClient, walletClient, registry, resolver, registrarC, a);
  }

  writeTownRegistrar(town, registrar);
  console.log(`\nMinted 8 names. tokenIds were printed only (R3).`);
  console.log(
    `Confirm: UR.resolve each ${plan.agents.map((x) => x.ensName).join(" | ")} → Arc wallet.`,
  );
}

async function mintOne(
  publicClient: ReturnType<typeof createPublicClient>,
  walletClient: WalletClient,
  registry: { address: Address; abi: typeof townRegistryAbi },
  resolver: { address: Address; abi: typeof townResolverAbi },
  registrarC: { address: Address; abi: typeof townRegistrarAbi },
  a: AgentMintPlan,
): Promise<void> {
  const anyId = labelhashOf(a.name);
  const before = await publicClient.readContract({
    ...registry,
    functionName: "getState",
    args: [anyId],
  });
  if (before.status !== 2) {
    console.log(`\n-- broadcasting register(${a.name}, owner=${a.owner}, role=${a.registrarRole})`);
    const { result } = await publicClient.simulateContract({
      ...registrarC,
      functionName: "register",
      args: [a.name, a.owner, a.registrarRole],
      account: walletClient.account,
    });
    console.log(`    simulate tokenId  ${result}  (discarded — re-read via labelhash, R3)`);
    await send(publicClient, walletClient, {
      ...registrarC,
      functionName: "register",
      args: [a.name, a.owner, a.registrarRole],
    });
  } else {
    console.log(`\n-- ${a.name} already REGISTERED; skipping register`);
  }
  const live = await publicClient.readContract({
    ...registry,
    functionName: "getState",
    args: [anyId],
  });
  console.log(
    `    getState(labelhash) tokenId ${live.tokenId}  ← printed only, never persisted (R3)`,
  );
  console.log(`-- broadcasting setAddress/setText multicall for ${a.ensName}`);
  await send(publicClient, walletClient, {
    ...resolver,
    functionName: "multicall",
    args: [
      [
        a.calls.setAddrArc,
        a.calls.setAddrEth,
        a.calls.setAgentContext,
        a.calls.setTownRole,
        a.calls.setAvatar,
      ],
    ],
  });
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

function writeTownRegistrar(town: TownFile, registrar: Address): void {
  const next = {
    ...town,
    contracts: { ...town.contracts, TownRegistrar: registrar },
    env: {
      ENS_TOWN_REGISTRY: town.contracts.TownRegistry,
      ENS_TOWN_RESOLVER: town.contracts.TownResolver,
      ENS_TOWN_REGISTRAR: registrar,
    },
  };
  writeFileSync(TOWN_FILE, JSON.stringify(next, null, 2) + "\n");
  console.log(`\nwrote              ${TOWN_FILE} TownRegistrar (no tokenId — R3)`);
}

main().catch((err) => {
  console.error(err instanceof BaseError ? err.shortMessage : err);
  process.exit(1);
});
