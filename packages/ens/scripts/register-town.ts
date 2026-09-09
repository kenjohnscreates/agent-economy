#!/usr/bin/env tsx
// M0.4 — register <ENS_TOWN_NAME>.eth on the ENSv2 HACKATHON deployment (Sepolia) via
// ETHRegistrar commit-reveal. Payment is MockUSDC (open mint), NOT ETH.
//
//   pnpm --filter @agent-town/ens register-town -- --status     read-only, no key needed
//   pnpm --filter @agent-town/ens register-town -- --dry-run    status + eth_call simulations
//   pnpm --filter @agent-town/ens register-town -- --commit     TX 1: commit(hash)      (needs key)
//   pnpm --filter @agent-town/ens register-town -- --register   TX 2: register(...)     (needs key, ≥60s later)
//
// Addresses: src/deployments.ts only (hackathon-frozen set, R2). tokenIds are printed,
// never persisted (R3). Secret + params live in packages/ens/.town-commit.json (gitignored).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeAbiParameters,
  encodeFunctionData,
  formatEther,
  formatUnits,
  http,
  keccak256,
  pad,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
  type StateOverride,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  ethRegistrarAbi,
  ethRegistryAbi,
  mockUsdcAbi,
  rentPriceOracleAbi,
} from "../src/abi/index.js";
import { makeCommitment, ZERO_BYTES32, type CommitmentParams } from "../src/commitment.js";
import { SEPOLIA_CHAIN_ID, addresses } from "../src/deployments.js";

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------
const MODES = ["--status", "--dry-run", "--commit", "--register"] as const;
type Mode = (typeof MODES)[number];

const ONE_YEAR = 365n * 24n * 60n * 60n; // 31_536_000 s
const READONLY_RPC_FALLBACK = "https://ethereum-sepolia-rpc.publicnode.com";
// Non-zero (register() rejects owner=0) and unlikely to hold funds, so no-key dry-runs show realistic ✗ marks.
const PLACEHOLDER_SIGNER: Address = "0x0000000000000000000000000000000000abcdef";
const COMMIT_FILE = fileURLToPath(new URL("../.town-commit.json", import.meta.url));
const REPO_ROOT_ENV = fileURLToPath(new URL("../../../.env", import.meta.url));

// Storage slots used by --dry-run state overrides (verified at runtime before use).
// ETHRegistrar: Ownable._owner=0, AbstractETHRegistrar.rentPriceOracle=1, commitmentAt=2.
const REGISTRAR_COMMITMENT_SLOT = 2n;
// MockERC20 = OZ ERC20: _balances=0, _allowances=1.
const ERC20_BALANCES_SLOT = 0n;
const ERC20_ALLOWANCES_SLOT = 1n;

interface CommitFile {
  chainId: number;
  registrar: Address;
  label: string;
  owner: Address;
  secret: Hex;
  subregistry: Address;
  resolver: Address;
  duration: string;
  referrer: Hex;
  commitment: Hex;
  commitTxHash?: Hex;
  committedAt?: number;
  registerTxHash?: Hex;
}

function loadEnv(): void {
  // node ≥22: like `--env-file`, does not override already-set vars. Missing file is fine.
  for (const p of [REPO_ROOT_ENV, ".env"]) {
    try {
      if (existsSync(p)) process.loadEnvFile(p);
    } catch {
      /* ignore */
    }
  }
}

function parseMode(argv: string[]): Mode {
  const found = argv.filter((a): a is Mode => (MODES as readonly string[]).includes(a));
  if (found.length > 1) fail(`pick exactly one of ${MODES.join(" | ")}`);
  return found[0] ?? "--status";
}

function fail(msg: string): never {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

function fmtSecs(s: bigint | number): string {
  const n = Number(s);
  if (n % 86400 === 0) return `${n}s (${n / 86400}d)`;
  if (n % 3600 === 0) return `${n}s (${n / 3600}h)`;
  if (n % 60 === 0) return `${n}s (${n / 60}m)`;
  return `${n}s`;
}

function mappingSlot(key: Hex, slot: bigint): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [key, slot]));
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

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  loadEnv();
  const mode = parseMode(process.argv.slice(2));
  const write = mode === "--commit" || mode === "--register";

  const label = (process.env.ENS_TOWN_NAME ?? "botanica").trim().toLowerCase();
  if (!/^[a-z0-9-]{3,}$/.test(label))
    fail(`ENS_TOWN_NAME "${label}" is not a plain lowercase label`);

  const rpcUrl = process.env.SEPOLIA_RPC_URL?.trim() || (write ? "" : READONLY_RPC_FALLBACK);
  if (!rpcUrl)
    fail("SEPOLIA_RPC_URL is required for --commit/--register (fallback RPC is read-only)");

  const pk = process.env.ENS_TREASURER_PRIVATE_KEY?.trim();
  const account = pk ? privateKeyToAccount(pk as Hex) : undefined;
  if (write && !account) fail("ENS_TREASURER_PRIVATE_KEY is required for --commit/--register");
  const signer: Address = account?.address ?? PLACEHOLDER_SIGNER;

  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  if (chainId !== SEPOLIA_CHAIN_ID)
    fail(`RPC chainId ${chainId} != ${SEPOLIA_CHAIN_ID} (Sepolia) — refusing (R2)`);

  const registrar = { address: addresses.ETHRegistrar, abi: ethRegistrarAbi } as const;
  const registry = { address: addresses.ETHRegistry, abi: ethRegistryAbi } as const;
  const oracle = { address: addresses.StandardRentPriceOracle, abi: rentPriceOracleAbi } as const;
  const usdc = { address: addresses.MockUSDC, abi: mockUsdcAbi } as const;

  console.log(`\n== Agent Town · ENSv2 hackathon registrar · ${mode}`);
  console.log(`chain              sepolia (${chainId})   rpc: ${rpcUrl}`);
  console.log(`ETHRegistrar       ${registrar.address}`);
  console.log(`ETHRegistry        ${registry.address}`);
  console.log(`RentPriceOracle    ${oracle.address}`);
  console.log(`MockUSDC           ${usdc.address}`);

  // ---- registrar wiring sanity (R2: deployments.json must agree with chain) ----
  const [wiredRegistry, wiredOracle, minAge, maxAge, minDuration, gracePeriod] = await Promise.all([
    publicClient.readContract({ ...registrar, functionName: "ETH_REGISTRY" }),
    publicClient.readContract({ ...registrar, functionName: "rentPriceOracle" }),
    publicClient.readContract({ ...registrar, functionName: "MIN_COMMITMENT_AGE" }),
    publicClient.readContract({ ...registrar, functionName: "MAX_COMMITMENT_AGE" }),
    publicClient.readContract({ ...registrar, functionName: "MIN_REGISTER_DURATION" }),
    publicClient.readContract({ ...registrar, functionName: "GRACE_PERIOD" }),
  ]);
  if (wiredRegistry.toLowerCase() !== registry.address.toLowerCase()) {
    fail(
      `ETHRegistrar.ETH_REGISTRY()=${wiredRegistry} != deployments ETHRegistry ${registry.address}`,
    );
  }
  if (wiredOracle.toLowerCase() !== oracle.address.toLowerCase()) {
    fail(
      `ETHRegistrar.rentPriceOracle()=${wiredOracle} != deployments StandardRentPriceOracle ${oracle.address}`,
    );
  }
  if (ONE_YEAR < minDuration) fail(`duration ${ONE_YEAR}s < MIN_REGISTER_DURATION ${minDuration}s`);

  // ---- name status ----
  const labelhash = BigInt(keccak256(toHex(label)));
  const [available, state, subregistry, resolver] = await Promise.all([
    publicClient.readContract({ ...registrar, functionName: "isAvailable", args: [label] }),
    publicClient.readContract({ ...registry, functionName: "getState", args: [labelhash] }),
    publicClient.readContract({ ...registry, functionName: "getSubregistry", args: [label] }),
    publicClient.readContract({ ...registry, functionName: "getResolver", args: [label] }),
  ]);
  const statusName = ["AVAILABLE", "RESERVED", "REGISTERED"][state.status] ?? `?${state.status}`;
  console.log(`\n-- name`);
  console.log(`label              ${label}  →  ${label}.eth`);
  console.log(`labelhash          0x${labelhash.toString(16).padStart(64, "0")}`);
  console.log(`isAvailable        ${available}`);
  console.log(
    `registry status    ${statusName}  expiry=${state.expiry}  latestOwner=${state.latestOwner}`,
  );
  if (state.status === 2) console.log(`tokenId (live, NOT persisted — R3)  ${state.tokenId}`);
  console.log(`subregistry        ${subregistry}`);
  console.log(`resolver           ${resolver}`);
  console.log(`\n-- registrar params`);
  console.log(`MIN_COMMITMENT_AGE ${fmtSecs(minAge)}`);
  console.log(`MAX_COMMITMENT_AGE ${fmtSecs(maxAge)}`);
  console.log(`MIN_REGISTER_DUR   ${fmtSecs(minDuration)}`);
  console.log(`GRACE_PERIOD       ${fmtSecs(gracePeriod)}`);

  // ---- price ----
  const [usdcIsPayment, usdcRatio, usdcDecimals, usdcSymbol] = await Promise.all([
    publicClient.readContract({ ...oracle, functionName: "isPaymentToken", args: [usdc.address] }),
    publicClient.readContract({
      ...oracle,
      functionName: "getPaymentTokenRatio",
      args: [usdc.address],
    }),
    publicClient.readContract({ ...usdc, functionName: "decimals" }),
    publicClient.readContract({ ...usdc, functionName: "symbol" }),
  ]);
  if (!usdcIsPayment) fail(`oracle does not accept MockUSDC ${usdc.address} as payment token`);
  let base = 0n;
  let premium = 0n;
  let priceNote = "";
  try {
    [base, premium] = await publicClient.readContract({
      ...registrar,
      functionName: "getRegisterPrice",
      args: [label, ONE_YEAR, usdc.address],
    });
  } catch (err) {
    priceNote = `getRegisterPrice reverted: ${describeRevert(err)} (name not available?)`;
  }
  const total = base + premium;
  console.log(`\n-- price (duration 1y = ${ONE_YEAR}s)`);
  console.log(
    `payment token      MockUSDC ${usdc.address} (${usdcSymbol}, ${usdcDecimals} dp; oracle ratio ${usdcRatio[0]}/${usdcRatio[1]}; open mint())`,
  );
  if (priceNote) console.log(`price              ${priceNote}`);
  else {
    console.log(
      `base               ${base} units = ${formatUnits(base, usdcDecimals)} ${usdcSymbol}`,
    );
    console.log(
      `premium            ${premium} units = ${formatUnits(premium, usdcDecimals)} ${usdcSymbol}`,
    );
    console.log(
      `TOTAL              ${total} units = ${formatUnits(total, usdcDecimals)} ${usdcSymbol}`,
    );
  }

  // ---- signer ----
  const [ethBalance, usdcBalance, usdcAllowance] = await Promise.all([
    publicClient.getBalance({ address: signer }),
    publicClient.readContract({ ...usdc, functionName: "balanceOf", args: [signer] }),
    publicClient.readContract({
      ...usdc,
      functionName: "allowance",
      args: [signer, registrar.address],
    }),
  ]);
  console.log(`\n-- signer (treasurer)`);
  console.log(
    `address            ${signer}${account ? "" : "  (PLACEHOLDER — ENS_TREASURER_PRIVATE_KEY not set)"}`,
  );
  console.log(
    `ETH balance        ${formatEther(ethBalance)} ETH (gas only; registration is not ETH-priced)`,
  );
  console.log(
    `USDC balance       ${formatUnits(usdcBalance, usdcDecimals)} ${usdcSymbol}  ${usdcBalance >= total ? "✓" : `✗ need ${formatUnits(total - usdcBalance, usdcDecimals)} more (mint)`}`,
  );
  console.log(
    `USDC allowance     ${formatUnits(usdcAllowance, usdcDecimals)} ${usdcSymbol} → ETHRegistrar  ${usdcAllowance >= total ? "✓" : "✗ (approve needed)"}`,
  );

  // ---- commitment params (owner = signer; subregistry/resolver zero → M2.1 points them) ----
  const existing = readCommitFile();
  const reusable =
    existing &&
    existing.chainId === chainId &&
    existing.registrar.toLowerCase() === registrar.address.toLowerCase() &&
    existing.label === label &&
    existing.owner.toLowerCase() === signer.toLowerCase() &&
    existing.duration === ONE_YEAR.toString() &&
    existing.subregistry === zeroAddress &&
    existing.resolver === zeroAddress &&
    existing.referrer === ZERO_BYTES32;
  const params: CommitmentParams = {
    label,
    owner: signer,
    secret: reusable ? existing.secret : randomSecret(),
    subregistry: zeroAddress,
    resolver: zeroAddress,
    duration: ONE_YEAR,
    referrer: ZERO_BYTES32,
  };
  const commitment = makeCommitment(params);
  const block = await publicClient.getBlock();
  const now = block.timestamp;
  const t0 = await publicClient.readContract({
    ...registrar,
    functionName: "commitmentAt",
    args: [commitment],
  });
  const commitValidFrom = t0 + minAge;
  const commitValidTo = t0 + maxAge;
  const commitOnchain = t0 > 0n;
  const commitAged = commitOnchain && now >= commitValidFrom && now < commitValidTo;
  const commitUnexpired = commitOnchain && now < commitValidTo;

  console.log(`\n-- commitment`);
  console.log(
    `.town-commit.json  ${existing ? (reusable ? "found, params match → reusing secret" : "found but params differ → ignored") : "none"}`,
  );
  console.log(
    `secret             ${reusable ? "(from file)" : "(fresh random — only persisted by --commit)"}`,
  );
  console.log(`commitment         ${commitment}`);
  console.log(
    `commitmentAt       ${t0}${commitOnchain ? `  (valid ${commitValidFrom}..${commitValidTo}; now ${now}; ${commitAged ? "READY to register" : now < commitValidFrom ? `wait ${commitValidFrom - now}s` : "EXPIRED"})` : "  (not on-chain)"}`,
  );

  if (mode === "--status") return;

  // -------------------------------------------------------------------------
  // --dry-run: eth_call simulations, nothing broadcast
  // -------------------------------------------------------------------------
  if (mode === "--dry-run") {
    const onchainCommitment = await publicClient.readContract({
      ...registrar,
      functionName: "makeCommitment",
      args: [
        params.label,
        params.owner,
        params.secret,
        params.subregistry,
        params.resolver,
        params.duration,
        params.referrer,
      ],
    });
    console.log(`\n-- dry-run (eth_call only; NOTHING is broadcast)`);
    console.log(
      `local makeCommitment == on-chain  ${onchainCommitment === commitment ? "✓" : `✗ MISMATCH ${onchainCommitment}`}`,
    );
    if (onchainCommitment !== commitment)
      fail("local commitment helper disagrees with ETHRegistrar.makeCommitment");

    const commitData = encodeFunctionData({
      abi: ethRegistrarAbi,
      functionName: "commit",
      args: [commitment],
    });
    console.log(`\n[1] commit(bytes32)   to=${registrar.address}`);
    console.log(`    calldata          ${commitData}`);
    try {
      await publicClient.simulateContract({
        ...registrar,
        functionName: "commit",
        args: [commitment],
        account: signer,
      });
      console.log(`    simulate          ✓ would succeed`);
    } catch (err) {
      console.log(
        `    simulate          ✗ ${describeRevert(err)}${commitUnexpired ? "  (expected: commitment already on-chain; --commit will skip)" : ""}`,
      );
    }

    const registerArgs = [
      params.label,
      params.owner,
      params.secret,
      params.subregistry,
      params.resolver,
      params.duration,
      usdc.address,
      params.referrer,
    ] as const;
    const registerData = encodeFunctionData({
      abi: ethRegistrarAbi,
      functionName: "register",
      args: registerArgs,
    });
    console.log(`\n[2] register(...)     to=${registrar.address}`);
    console.log(
      `    args              label=${label} owner=${signer} subregistry=${zeroAddress} resolver=${zeroAddress} duration=${ONE_YEAR} paymentToken=${usdc.address} referrer=0x0`,
    );
    console.log(`    calldata          ${registerData}`);

    // Build state overrides only for what the real chain state lacks, and verify each
    // slot guess by reading it back under the override before trusting it.
    const overrides: StateOverride = [];
    const assumed: string[] = [];
    if (!commitAged) {
      const slot = mappingSlot(commitment, REGISTRAR_COMMITMENT_SLOT);
      const fakeT0 = now - minAge - 1n;
      const ov: StateOverride = [
        { address: registrar.address, stateDiff: [{ slot, value: pad(toHex(fakeT0)) }] },
      ];
      const check = await publicClient.readContract({
        ...registrar,
        functionName: "commitmentAt",
        args: [commitment],
        stateOverride: ov,
      });
      if (check === fakeT0) {
        overrides.push(...ov);
        assumed.push(
          `commitment aged ${minAge + 1n}s (slot ${REGISTRAR_COMMITMENT_SLOT} override)`,
        );
      } else
        console.log(
          `    note              commitmentAt slot override not honoured by RPC → register will revert on commitment`,
        );
    }
    if (usdcBalance < total) {
      const slot = mappingSlot(pad(signer), ERC20_BALANCES_SLOT);
      const ov: StateOverride = [
        { address: usdc.address, stateDiff: [{ slot, value: pad(toHex(total)) }] },
      ];
      const check = await publicClient.readContract({
        ...usdc,
        functionName: "balanceOf",
        args: [signer],
        stateOverride: ov,
      });
      if (check === total) {
        overrides.push(...ov);
        assumed.push(`signer holds ${formatUnits(total, usdcDecimals)} USDC`);
      } else
        console.log(
          `    note              USDC balance override not honoured → register will revert on payment`,
        );
    }
    if (usdcAllowance < total) {
      const slot = mappingSlot(
        pad(registrar.address),
        BigInt(mappingSlot(pad(signer), ERC20_ALLOWANCES_SLOT)),
      );
      const ov: StateOverride = [
        { address: usdc.address, stateDiff: [{ slot, value: pad(toHex(total)) }] },
      ];
      const check = await publicClient.readContract({
        ...usdc,
        functionName: "allowance",
        args: [signer, registrar.address],
        stateOverride: ov,
      });
      if (check === total) {
        overrides.push(...ov);
        assumed.push(`allowance ${formatUnits(total, usdcDecimals)} USDC → registrar`);
      } else
        console.log(
          `    note              USDC allowance override not honoured → register will revert on payment`,
        );
    }
    // merge overrides per address (viem wants one entry per address)
    const merged = mergeOverrides(overrides);
    if (assumed.length) console.log(`    simulated as if   ${assumed.join("; ")}`);
    try {
      const { result } = await publicClient.simulateContract({
        ...registrar,
        functionName: "register",
        args: registerArgs,
        account: signer,
        stateOverride: merged.length ? merged : undefined,
      });
      console.log(`    simulate          ✓ would succeed → tokenId ${result} (not persisted — R3)`);
    } catch (err) {
      console.log(`    simulate          ✗ ${describeRevert(err)}`);
    }
    console.log(`\nNothing was broadcast. Next: --commit, then --register after ≥${minAge}s.`);
    return;
  }

  // -------------------------------------------------------------------------
  // --commit: TX 1
  // -------------------------------------------------------------------------
  if (!account) fail("signer required");
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });

  if (mode === "--commit") {
    if (!available) fail(`${label}.eth is not available (status ${statusName})`);
    if (commitUnexpired) {
      console.log(
        `\n✓ valid unexpired commitment already on-chain (commitmentAt=${t0}); skipping commit.`,
      );
      if (!reusable)
        fail(
          "…but .town-commit.json is missing/mismatched — the secret is unrecoverable; wait for expiry or restore the file",
        );
      return;
    }
    console.log(`\n-- broadcasting commit(${commitment})`);
    await publicClient.simulateContract({
      ...registrar,
      functionName: "commit",
      args: [commitment],
      account,
    });
    const hash = await walletClient.writeContract({
      ...registrar,
      functionName: "commit",
      args: [commitment],
    });
    console.log(`tx                 ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") fail(`commit tx reverted: ${hash}`);
    const mined = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
    writeCommitFile({
      chainId,
      registrar: registrar.address,
      label,
      owner: signer,
      secret: params.secret,
      subregistry: params.subregistry,
      resolver: params.resolver,
      duration: ONE_YEAR.toString(),
      referrer: params.referrer,
      commitment,
      commitTxHash: hash,
      committedAt: Number(mined.timestamp),
    });
    console.log(`mined              block ${receipt.blockNumber} @ ${mined.timestamp}`);
    console.log(`saved              ${COMMIT_FILE} (gitignored; keep until --register succeeds)`);
    console.log(`\nNext: wait ≥${minAge}s (before ${maxAge}s), then run --register.`);
    return;
  }

  // -------------------------------------------------------------------------
  // --register: TX 2 (+ mint/approve if needed)
  // -------------------------------------------------------------------------
  if (mode === "--register") {
    if (!reusable) fail("no matching .town-commit.json — run --commit first");
    if (!commitOnchain) fail("commitment not on-chain — run --commit first");
    if (now >= commitValidTo) fail("commitment expired — run --commit again (new secret)");
    if (!available) fail(`${label}.eth is not available (status ${statusName})`);

    if (now < commitValidFrom) {
      console.log(`\nwaiting ${commitValidFrom - now}s for MIN_COMMITMENT_AGE…`);
      while (true) {
        await new Promise((r) => setTimeout(r, 6_000));
        const b = await publicClient.getBlock();
        if (b.timestamp >= commitValidFrom) break;
        process.stdout.write(`  block ${b.number} ts ${b.timestamp} (need ${commitValidFrom})\r`);
      }
      console.log(`\ncommitment aged ✓`);
    }

    if (usdcBalance < total) {
      const shortfall = total - usdcBalance;
      console.log(
        `\n-- minting ${formatUnits(shortfall, usdcDecimals)} MockUSDC to signer (open mint on hackathon token)`,
      );
      const h = await walletClient.writeContract({
        ...usdc,
        functionName: "mint",
        args: [signer, shortfall],
      });
      console.log(`tx                 ${h}`);
      const r = await publicClient.waitForTransactionReceipt({ hash: h });
      if (r.status !== "success") fail(`mint reverted: ${h}`);
    }
    if (usdcAllowance < total) {
      console.log(`\n-- approving ${formatUnits(total, usdcDecimals)} MockUSDC → ETHRegistrar`);
      const h = await walletClient.writeContract({
        ...usdc,
        functionName: "approve",
        args: [registrar.address, total],
      });
      console.log(`tx                 ${h}`);
      const r = await publicClient.waitForTransactionReceipt({ hash: h });
      if (r.status !== "success") fail(`approve reverted: ${h}`);
    }

    const registerArgs = [
      params.label,
      params.owner,
      params.secret,
      params.subregistry,
      params.resolver,
      params.duration,
      usdc.address,
      params.referrer,
    ] as const;
    console.log(`\n-- broadcasting register(${label}, owner=${signer}, 1y, MockUSDC)`);
    try {
      await publicClient.simulateContract({
        ...registrar,
        functionName: "register",
        args: registerArgs,
        account,
      });
    } catch (err) {
      fail(`register simulation failed: ${describeRevert(err)}`);
    }
    const hash = await walletClient.writeContract({
      ...registrar,
      functionName: "register",
      args: registerArgs,
    });
    console.log(`tx                 ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") fail(`register tx reverted: ${hash}`);
    let tokenIdFromEvent: bigint | undefined;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== registrar.address.toLowerCase()) continue;
      try {
        const ev = decodeEventLog({ abi: ethRegistrarAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "NameRegistered") tokenIdFromEvent = ev.args.tokenId;
      } catch {
        /* other event */
      }
    }
    const after = await publicClient.readContract({
      ...registry,
      functionName: "getState",
      args: [labelhash],
    });
    const ownerNow = await publicClient.readContract({
      ...registry,
      functionName: "getOwner",
      args: [labelhash],
    });
    console.log(`\n-- confirmed via ETHRegistry.getState(labelhash)`);
    console.log(`status             ${["AVAILABLE", "RESERVED", "REGISTERED"][after.status]}`);
    console.log(
      `owner              ${ownerNow}  ${ownerNow.toLowerCase() === signer.toLowerCase() ? "✓ treasurer" : "✗ UNEXPECTED"}`,
    );
    console.log(`expiry             ${after.expiry}`);
    console.log(
      `tokenId            ${after.tokenId}${tokenIdFromEvent !== undefined && tokenIdFromEvent !== after.tokenId ? ` (event said ${tokenIdFromEvent})` : ""}  ← printed only, never persisted (R3)`,
    );
    if (reusable) writeCommitFile({ ...existing, registerTxHash: hash });
    console.log(`\n${label}.eth registered. M2.1 will set subregistry/resolver.`);
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function randomSecret(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

function readCommitFile(): CommitFile | undefined {
  if (!existsSync(COMMIT_FILE)) return undefined;
  try {
    return JSON.parse(readFileSync(COMMIT_FILE, "utf8")) as CommitFile;
  } catch {
    return undefined;
  }
}

function writeCommitFile(f: CommitFile): void {
  writeFileSync(COMMIT_FILE, JSON.stringify(f, null, 2) + "\n", { mode: 0o600 });
}

function mergeOverrides(list: StateOverride): StateOverride {
  const byAddr = new Map<string, StateOverride[number]>();
  for (const o of list) {
    const key = o.address.toLowerCase();
    const prev = byAddr.get(key);
    if (!prev) byAddr.set(key, { address: o.address, stateDiff: [...(o.stateDiff ?? [])] });
    else prev.stateDiff = [...(prev.stateDiff ?? []), ...(o.stateDiff ?? [])];
  }
  return [...byAddr.values()];
}

main().catch((err) => {
  console.error(err instanceof BaseError ? err.shortMessage : err);
  process.exit(1);
});
