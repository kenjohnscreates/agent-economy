#!/usr/bin/env tsx
// M2.1 — deploy botanica.eth PermissionedRegistry (UserRegistry proxy) +
// PermissionedResolver via VerifiableFactory; point ETHRegistry at them.
//
//   pnpm --filter @agent-town/ens deploy-town-subregistry            # --dry-run
//   pnpm --filter @agent-town/ens deploy-town-subregistry -- --dry-run
//   pnpm --filter @agent-town/ens deploy-town-subregistry -- --broadcast
//
// Default is dry-run (eth_call only). --broadcast is the only write path;
// refuse any other flag. Addresses: deployments.ts (hackathon-frozen, R2).
// Parent-name writes use labelhash(anyId), never a persisted tokenId (R3).
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  parseEventLogs,
  zeroAddress,
  type Account,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { ethRegistryAbi, verifiableFactoryAbi } from "../src/abi/index.js";
import { SEPOLIA_CHAIN_ID, addresses } from "../src/deployments.js";
import {
  encodeDeployProxy,
  encodeRegistryInit,
  encodeResolverInit,
  encodeSetResolver,
  encodeSetSubregistry,
  labelhashOf,
  registrySalt,
  resolverSalt,
  townDeployRecord,
} from "../src/factory.js";

const MODES = ["--dry-run", "--broadcast"] as const;
type Mode = (typeof MODES)[number];

const READONLY_RPC_FALLBACK = "https://ethereum-sepolia-rpc.publicnode.com";
const FAUCET_URL = "https://sepoliafaucet.com";
const TOWN_FILE = fileURLToPath(new URL("../town.json", import.meta.url));
const REPO_ROOT_ENV = fileURLToPath(new URL("../../../.env", import.meta.url));
const GAS_BUDGET = 1_200_000n;

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

async function main(): Promise<void> {
  loadEnv();
  const mode = parseMode(process.argv.slice(2));
  const write = mode === "--broadcast";

  const label = (process.env.ENS_TOWN_NAME ?? "botanica").trim().toLowerCase();
  if (!/^[a-z0-9-]{3,}$/.test(label))
    fail(`ENS_TOWN_NAME "${label}" is not a plain lowercase label`);
  const fullName = `${label}.eth`;

  const rpcUrl = process.env.SEPOLIA_RPC_URL?.trim() || (write ? "" : READONLY_RPC_FALLBACK);
  if (!rpcUrl) fail("SEPOLIA_RPC_URL is required for --broadcast (fallback RPC is read-only)");

  const pk = process.env.ENS_TREASURER_PRIVATE_KEY?.trim();
  const account = pk ? privateKeyToAccount(pk as Hex) : undefined;
  if (write && !account) fail("ENS_TREASURER_PRIVATE_KEY is required for --broadcast");

  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  if (chainId !== SEPOLIA_CHAIN_ID)
    fail(`RPC chainId ${chainId} != ${SEPOLIA_CHAIN_ID} (Sepolia) — refusing (R2)`);

  const factory = { address: addresses.VerifiableFactory, abi: verifiableFactoryAbi } as const;
  const registry = { address: addresses.ETHRegistry, abi: ethRegistryAbi } as const;
  const labelhash = labelhashOf(label);

  const [proxyLogic, state, currentOwner, subregistry, resolver] = await Promise.all([
    publicClient.readContract({ ...factory, functionName: "proxyLogic" }),
    publicClient.readContract({ ...registry, functionName: "getState", args: [labelhash] }),
    publicClient.readContract({ ...registry, functionName: "getOwner", args: [labelhash] }),
    publicClient.readContract({ ...registry, functionName: "getSubregistry", args: [label] }),
    publicClient.readContract({ ...registry, functionName: "getResolver", args: [label] }),
  ]);

  const signer: Address = account?.address ?? currentOwner;
  if (account && account.address.toLowerCase() !== currentOwner.toLowerCase()) {
    fail(`signer ${account.address} is not on-chain owner ${currentOwner} of ${fullName}`);
  }

  const statusName = ["AVAILABLE", "RESERVED", "REGISTERED"][state.status] ?? `?${state.status}`;
  const saltReg = registrySalt(fullName);
  const saltRes = resolverSalt(signer);
  const initReg = encodeRegistryInit(signer);
  const initRes = encodeResolverInit(signer);
  const deployReg = encodeDeployProxy(addresses.UserRegistryImpl, saltReg, initReg);
  const deployRes = encodeDeployProxy(addresses.PermissionedResolverImpl, saltRes, initRes);

  console.log(`\n== Agent Town · ENSv2 town subregistry · ${mode}`);
  console.log(`chain              sepolia (${chainId})   rpc: ${rpcUrl}`);
  console.log(`VerifiableFactory  ${factory.address}`);
  console.log(`proxyLogic         ${proxyLogic}`);
  console.log(`UserRegistryImpl   ${addresses.UserRegistryImpl}`);
  console.log(`PermissionedResolverImpl ${addresses.PermissionedResolverImpl}`);
  console.log(`ETHRegistry        ${registry.address}`);
  console.log(`UpgradableURProxy  ${addresses.UpgradableUniversalResolverProxy}`);

  console.log(`\n-- name (label, not tokenId — R3)`);
  console.log(`label              ${label}  →  ${fullName}`);
  console.log(`labelhash (anyId)  0x${labelhash.toString(16).padStart(64, "0")}`);
  console.log(`registry status    ${statusName}  owner=${currentOwner}  expiry=${state.expiry}`);
  if (state.status === 2) console.log(`tokenId (live, NOT persisted — R3)  ${state.tokenId}`);
  console.log(`subregistry        ${subregistry}`);
  console.log(`resolver           ${resolver}`);
  console.log(`\n-- signer (treasurer)`);
  console.log(
    `address            ${signer}${account ? "" : "  (no key — simulating as on-chain owner)"}`,
  );

  if (state.status !== 2)
    fail(`${fullName} is not REGISTERED (status ${statusName}) — run M0.4 first`);
  if (currentOwner === zeroAddress) fail(`${fullName} has no owner`);

  console.log(`\n-- factory salts (version=0)`);
  console.log(
    `registrySalt       ${toHex32(saltReg)}  keccak256("UserRegistry", namehash(${fullName}), 0)`,
  );
  console.log(`resolverSalt       ${toHex32(saltRes)}  keccak256("OwnedResolver", owner, 0)`);

  console.log(`\n-- calldata`);
  console.log(`[1] factory.deployProxy(UserRegistryImpl, registrySalt, initialize(grants[]))`);
  console.log(`    to                ${factory.address}`);
  console.log(`    calldata          ${deployReg}`);
  console.log(
    `[2] factory.deployProxy(PermissionedResolverImpl, resolverSalt, initialize(grants[],[]))`,
  );
  console.log(`    to                ${factory.address}`);
  console.log(`    calldata          ${deployRes}`);

  console.log(`\n-- dry-run simulations (eth_call; NOTHING is broadcast yet)`);
  const predictedRegistry = await simDeploy(
    publicClient,
    factory,
    addresses.UserRegistryImpl,
    saltReg,
    initReg,
    signer,
    "UserRegistry",
  );
  const predictedResolver = await simDeploy(
    publicClient,
    factory,
    addresses.PermissionedResolverImpl,
    saltRes,
    initRes,
    signer,
    "PermissionedResolver",
  );

  const pointerRegistry =
    predictedRegistry ?? (subregistry !== zeroAddress ? subregistry : undefined);
  const pointerResolver = predictedResolver ?? (resolver !== zeroAddress ? resolver : undefined);

  if (pointerRegistry) {
    const setSub = encodeSetSubregistry(labelhash, pointerRegistry);
    console.log(`\n[3] ETHRegistry.setSubregistry(labelhash(${label}), ${pointerRegistry})`);
    console.log(`    calldata          ${setSub}`);
    await simPointer(publicClient, registry, "setSubregistry", labelhash, pointerRegistry, signer);
  } else {
    console.log(`\n[3] setSubregistry     skipped (no predicted/existing registry address)`);
  }
  if (pointerResolver) {
    const setRes = encodeSetResolver(labelhash, pointerResolver);
    console.log(`\n[4] ETHRegistry.setResolver(labelhash(${label}), ${pointerResolver})`);
    console.log(`    calldata          ${setRes}`);
    await simPointer(publicClient, registry, "setResolver", labelhash, pointerResolver, signer);
  } else {
    console.log(`\n[4] setResolver        skipped (no predicted/existing resolver address)`);
  }

  if (!write) {
    console.log(`\nNothing was broadcast. After gate A:`);
    console.log(`  pnpm --filter @agent-town/ens deploy-town-subregistry -- --broadcast`);
    console.log(
      `Then copy printed ENS_TOWN_REGISTRY / ENS_TOWN_RESOLVER into .env (never commit the key).`,
    );
    console.log(`EXIT check: getSubregistry(${label}) returns the factory proxy after broadcast.`);
    return;
  }

  if (subregistry !== zeroAddress && resolver !== zeroAddress) {
    console.log(
      `\n✓ ${fullName} already points at subregistry ${subregistry} resolver ${resolver}`,
    );
    writeTown(chainId, label, subregistry, resolver);
    return;
  }

  if (!account) fail("signer required");
  const ethBalance = await publicClient.getBalance({ address: signer });
  if (ethBalance === 0n) {
    fail(`treasurer ${signer} has 0 Sepolia ETH — fund it before broadcasting: ${FAUCET_URL}`);
  }
  const fees = await publicClient.estimateFeesPerGas().catch(() => undefined);
  const maxFee = fees?.maxFeePerGas ?? fees?.gasPrice;
  if (maxFee !== undefined) {
    const needed = GAS_BUDGET * maxFee;
    console.log(
      `\ngas check          budget ${GAS_BUDGET} gas × maxFee ${maxFee} wei = ${formatEther(needed)} ETH  (have ${formatEther(ethBalance)})`,
    );
    if (ethBalance < needed) {
      fail(
        `treasurer ${signer} has ${formatEther(ethBalance)} ETH but ~${formatEther(needed)} ETH is needed — top up: ${FAUCET_URL}`,
      );
    }
  }

  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });

  const townRegistry =
    subregistry !== zeroAddress
      ? subregistry
      : await broadcastDeploy(
          publicClient,
          walletClient,
          account,
          factory,
          addresses.UserRegistryImpl,
          saltReg,
          initReg,
          "UserRegistry",
        );
  const townResolver =
    resolver !== zeroAddress
      ? resolver
      : await broadcastDeploy(
          publicClient,
          walletClient,
          account,
          factory,
          addresses.PermissionedResolverImpl,
          saltRes,
          initRes,
          "PermissionedResolver",
        );

  const live = await publicClient.readContract({
    ...registry,
    functionName: "getState",
    args: [labelhash],
  });
  console.log(`\n-- re-read getState(labelhash) before NFT-adjacent writes (R3)`);
  console.log(`tokenId            ${live.tokenId}  ← printed only, never persisted`);

  if (subregistry.toLowerCase() !== townRegistry.toLowerCase()) {
    console.log(`\n-- broadcasting setSubregistry(labelhash(${label}), ${townRegistry})`);
    await publicClient.simulateContract({
      ...registry,
      functionName: "setSubregistry",
      args: [labelhash, townRegistry],
      account,
    });
    const hash = await walletClient.writeContract({
      ...registry,
      functionName: "setSubregistry",
      args: [labelhash, townRegistry],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") fail(`setSubregistry reverted: ${hash}`);
    console.log(`tx                 ${hash}`);
  }
  if (resolver.toLowerCase() !== townResolver.toLowerCase()) {
    console.log(`\n-- broadcasting setResolver(labelhash(${label}), ${townResolver})`);
    await publicClient.simulateContract({
      ...registry,
      functionName: "setResolver",
      args: [labelhash, townResolver],
      account,
    });
    const hash = await walletClient.writeContract({
      ...registry,
      functionName: "setResolver",
      args: [labelhash, townResolver],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") fail(`setResolver reverted: ${hash}`);
    console.log(`tx                 ${hash}`);
  }

  const [afterSub, afterRes] = await Promise.all([
    publicClient.readContract({ ...registry, functionName: "getSubregistry", args: [label] }),
    publicClient.readContract({ ...registry, functionName: "getResolver", args: [label] }),
  ]);
  console.log(`\n-- confirmed via ETHRegistry.getSubregistry/getResolver(${label})`);
  console.log(
    `subregistry        ${afterSub}  ${afterSub.toLowerCase() === townRegistry.toLowerCase() ? "✓" : "✗ UNEXPECTED"}`,
  );
  console.log(
    `resolver           ${afterRes}  ${afterRes.toLowerCase() === townResolver.toLowerCase() ? "✓" : "✗ UNEXPECTED"}`,
  );
  if (afterSub.toLowerCase() !== townRegistry.toLowerCase())
    fail("getSubregistry did not return the factory proxy");
  writeTown(chainId, label, afterSub, afterRes);
}

function toHex32(n: bigint): Hex {
  return `0x${n.toString(16).padStart(64, "0")}`;
}

function writeTown(chainId: number, label: string, registry: Address, resolver: Address): void {
  const rec = townDeployRecord({ chainId, label, registry, resolver });
  writeFileSync(TOWN_FILE, JSON.stringify(rec, null, 2) + "\n");
  console.log(
    `\nwrote              ${TOWN_FILE} (only on --broadcast; do not invent addresses in git)`,
  );
  console.log(`Add to .env (gitignored):`);
  console.log(`ENS_TOWN_REGISTRY=${registry}`);
  console.log(`ENS_TOWN_RESOLVER=${resolver}`);
}

type Factory = { address: Address; abi: typeof verifiableFactoryAbi };
type Registry = { address: Address; abi: typeof ethRegistryAbi };

async function simDeploy(
  publicClient: ReturnType<typeof createPublicClient>,
  factory: Factory,
  implementation: Address,
  salt: bigint,
  data: Hex,
  account: Address,
  name: string,
): Promise<Address | undefined> {
  try {
    const { result } = await publicClient.simulateContract({
      ...factory,
      functionName: "deployProxy",
      args: [implementation, salt, data],
      account,
    });
    console.log(`    simulate ${name}  ✓ would succeed → ${result}`);
    return result;
  } catch (err) {
    console.log(
      `    simulate ${name}  ✗ ${describeRevert(err)}  (CREATE2 collision = already deployed?)`,
    );
    return undefined;
  }
}

async function simPointer(
  publicClient: ReturnType<typeof createPublicClient>,
  registry: Registry,
  fn: "setSubregistry" | "setResolver",
  anyId: bigint,
  target: Address,
  account: Address,
): Promise<void> {
  try {
    await publicClient.simulateContract({
      ...registry,
      functionName: fn,
      args: [anyId, target],
      account,
    });
    console.log(`    simulate          ✓ would succeed`);
  } catch (err) {
    console.log(`    simulate          ✗ ${describeRevert(err)}`);
  }
}

async function broadcastDeploy(
  publicClient: ReturnType<typeof createPublicClient>,
  walletClient: WalletClient,
  account: Account,
  factory: Factory,
  implementation: Address,
  salt: bigint,
  data: Hex,
  name: string,
): Promise<Address> {
  console.log(`\n-- broadcasting deployProxy(${name})`);
  const { result, request } = await publicClient.simulateContract({
    ...factory,
    functionName: "deployProxy",
    args: [implementation, salt, data],
    account,
  });
  const hash = await walletClient.writeContract(request);
  console.log(`tx                 ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") fail(`deployProxy(${name}) reverted: ${hash}`);
  const logs = parseEventLogs({
    abi: verifiableFactoryAbi,
    eventName: "ProxyDeployed",
    logs: receipt.logs,
  });
  const fromEvent = logs[0]?.args.proxyAddress;
  const proxy = fromEvent ?? result;
  if (!proxy) fail(`deployProxy(${name}) mined but no proxy address`);
  const impl = await publicClient.readContract({
    ...factory,
    functionName: "verifyContract",
    args: [proxy],
  });
  console.log(`proxy              ${proxy}  verifyContract → ${impl}`);
  if (impl.toLowerCase() !== implementation.toLowerCase()) {
    fail(`verifyContract(${proxy})=${impl} != ${implementation}`);
  }
  return proxy;
}

main().catch((err) => {
  console.error(err instanceof BaseError ? err.shortMessage : err);
  process.exit(1);
});
