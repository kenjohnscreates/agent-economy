// M1.4 fund plan: faucet-or-deployer → mayor → fan-out 2 USDC to 8 agents; treasury.fund().
// Inputs: roster snaps (6-dec ERC-20 + 18-dec native), TownTreasury address, preferCircle.
// Outputs: ordered idempotent steps (targets as 6-dec base-unit bigints). Script broadcasts.
//
// 6-vs-18 SPLIT (docs.arc.io/build/evm-differences; ARCHITECTURE §2; RISKS R4/R8):
//   Native USDC (`value` / eth_getBalance, 18 dec) and ERC-20 USDC (0x3600…, 6 dec) are the
//   SAME asset. A native send and an ERC-20 transfer both move one balance — never add them.
//   Circle SCAs pay gas from the native view; TownTreasury.fund(uint256) pulls via ERC-20
//   transferFrom (6-dec). We native-send 18-dec `value` (= 6-dec amount × 1e12) to wallets,
//   then Circle transferUsdc / fund() with 6-dec strings. Do not mix the two number spaces.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ROSTER, type Address } from "@agent-town/shared";
import { toUsdcDecimalString } from "./amounts.js";
import { ARC_TESTNET_BLOCKCHAIN } from "./client.js";
import { MAYOR_NAME, WALLET_NAMES, type WalletName } from "./roster.js";

const treasurer = ROSTER.find((r) => r.role === "treasurer");
if (!treasurer) throw new Error("ROSTER has no treasurer");
export const TREASURER_NAME: WalletName = treasurer.name;

/** 2 USDC (6-dec). Low end of M1.4's 2–10 range so ~20 USDC deployer/faucet still seeds treasury. */
export const AGENT_USDC_6 = 2_000_000n;
/** Equity top-up left in TownTreasury after agent stipends. */
export const TREASURY_SEED_6 = 3_000_000n;
/** Left on mayor after fan-out so Circle SCA gas does not zero the wallet. */
export const MAYOR_GAS_RESERVE_6 = 500_000n;
/** 1e12: multiply 6-dec base units to get 18-dec native wei (same USDC). */
export const USDC_6_TO_NATIVE_18 = 1_000_000_000_000n;

export const LIVE_TREASURY_ADDRESS: Address =
  "0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1";

/** Live Circle SCAs (M1.3). Used only when roster.json is empty. */
export const LIVE_FALLBACK_ADDRESSES: Record<WalletName, Address> = {
  ada: "0x97847b3c015994784ae8cf776ef9a4d563618cf2",
  bo: "0x337512e3f78e9ad91493a98143b511c46c3775f7",
  cy: "0xc0469ad2ee2acac0c9bd50e07481a5325f9c8950",
  dee: "0x70b1300425c37af893ca4841e4183e7f0a1bdb89",
  eli: "0x216ad8633cbcd6f63d6f79fcb5ae40bc5fe829dd",
  fay: "0xff7be88f27d518fdb80c8c7c9031894e21e37038",
  gus: "0x55911428be619c98220da9d6d9575d311d3082dc",
  hal: "0x8214a5d688494e04c4a67c0b299706ec61dbc469",
  mayor: "0x52b9c05db4866da39567a4f9f06fac448ea30685",
};

export const CIRCLE_FAUCET_API = "https://api.circle.com/v1/faucet/drips";
export const CIRCLE_FAUCET_WEB = "https://faucet.circle.com";

export interface FundAmounts {
  agentUsdc6: bigint;
  treasurySeed6: bigint;
  mayorGasReserve6: bigint;
}

export const DEFAULT_FUND_AMOUNTS: FundAmounts = {
  agentUsdc6: AGENT_USDC_6,
  treasurySeed6: TREASURY_SEED_6,
  mayorGasReserve6: MAYOR_GAS_RESERVE_6,
};

export interface FundWalletSnap {
  name: WalletName;
  address: Address;
  walletId?: string;
  usdc6: bigint;
  native18: bigint;
}

export type FundStep =
  | { kind: "faucet"; toName: typeof MAYOR_NAME; to: Address }
  | {
      kind: "deployer-native";
      toName: WalletName;
      to: Address;
      targetUsdc6: bigint;
      why: string;
    }
  | {
      kind: "circle-transfer";
      fromName: typeof MAYOR_NAME;
      fromWalletId: string;
      toName: WalletName;
      to: Address;
      targetUsdc6: bigint;
      why: string;
    }
  | {
      kind: "circle-fund";
      fromName: WalletName;
      fromWalletId: string;
      treasury: Address;
      amountUsdc6: bigint;
    }
  | { kind: "deployer-fund"; treasury: Address; amountUsdc6: bigint }
  | { kind: "skip"; name: string; why: string };

export interface FundPlan {
  steps: FundStep[];
  cfg: FundAmounts;
  mayorTarget6: bigint;
  preferCircle: boolean;
}

export function usdc6ToNative18(usdc6: bigint): bigint {
  if (usdc6 < 0n) throw new Error("usdc6ToNative18: negative");
  return usdc6 * USDC_6_TO_NATIVE_18;
}

export function native18ToUsdc6(wei: bigint): bigint {
  if (wei < 0n) throw new Error("native18ToUsdc6: negative");
  return wei / USDC_6_TO_NATIVE_18;
}

export function gapUsdc6(current: bigint, target: bigint): bigint {
  return current >= target ? 0n : target - current;
}

/** Ada (treasurer) carries stipend + treasury seed when treasury is still empty. */
export function agentTargetUsdc6(
  name: WalletName,
  treasuryUsdc6: bigint,
  cfg: FundAmounts = DEFAULT_FUND_AMOUNTS,
  circleFanOut: boolean,
): bigint {
  if (circleFanOut && name === TREASURER_NAME && treasuryUsdc6 < cfg.treasurySeed6) {
    return cfg.agentUsdc6 + cfg.treasurySeed6;
  }
  return cfg.agentUsdc6;
}

export function mayorSeedUsdc6(
  wallets: FundWalletSnap[],
  treasuryUsdc6: bigint,
  cfg: FundAmounts = DEFAULT_FUND_AMOUNTS,
): bigint {
  let outbound = 0n;
  for (const w of wallets) {
    if (w.name === MAYOR_NAME) continue;
    const target = agentTargetUsdc6(w.name, treasuryUsdc6, cfg, true);
    outbound += gapUsdc6(w.usdc6, target);
  }
  return outbound + cfg.mayorGasReserve6;
}

export function buildFundPlan(input: {
  wallets: FundWalletSnap[];
  treasuryUsdc6: bigint;
  treasury: Address;
  preferCircle: boolean;
  cfg?: Partial<FundAmounts>;
}): FundPlan {
  const cfg: FundAmounts = { ...DEFAULT_FUND_AMOUNTS, ...input.cfg };
  const steps: FundStep[] = [];
  const mayor = input.wallets.find((w) => w.name === MAYOR_NAME);
  const ada = input.wallets.find((w) => w.name === TREASURER_NAME);
  const agents = input.wallets.filter((w) => w.name !== MAYOR_NAME);
  const mayorTarget6 = mayorSeedUsdc6(input.wallets, input.treasuryUsdc6, cfg);
  const circle = Boolean(input.preferCircle && mayor?.walletId);

  if (mayor && mayor.usdc6 === 0n) {
    steps.push({ kind: "faucet", toName: MAYOR_NAME, to: mayor.address });
  }

  if (circle && mayor?.walletId) {
    pushMayorSeed(steps, mayor, mayorTarget6);
    for (const a of agents) {
      pushAgentStep(steps, a, input.treasuryUsdc6, cfg, mayor.walletId);
    }
  } else {
    for (const a of agents) {
      pushDirectAgent(steps, a, cfg.agentUsdc6);
    }
  }

  pushTreasuryStep(steps, {
    treasuryUsdc6: input.treasuryUsdc6,
    treasury: input.treasury,
    cfg,
    circle,
    ada,
  });

  return { steps, cfg, mayorTarget6, preferCircle: circle };
}

function pushMayorSeed(steps: FundStep[], mayor: FundWalletSnap, mayorTarget6: bigint): void {
  if (mayor.usdc6 >= mayorTarget6) {
    steps.push({ kind: "skip", name: MAYOR_NAME, why: `already >= ${mayorTarget6} base` });
    return;
  }
  steps.push({
    kind: "deployer-native",
    toName: MAYOR_NAME,
    to: mayor.address,
    targetUsdc6: mayorTarget6,
    why: "seed mayor for fan-out + gas reserve (R8)",
  });
}

function pushAgentStep(
  steps: FundStep[],
  a: FundWalletSnap,
  treasuryUsdc6: bigint,
  cfg: FundAmounts,
  mayorWalletId: string,
): void {
  const target = agentTargetUsdc6(a.name, treasuryUsdc6, cfg, true);
  if (a.usdc6 >= target) {
    steps.push({ kind: "skip", name: a.name, why: `already >= ${target} base` });
    return;
  }
  const extra = a.name === TREASURER_NAME && target > cfg.agentUsdc6;
  steps.push({
    kind: "circle-transfer",
    fromName: MAYOR_NAME,
    fromWalletId: mayorWalletId,
    toName: a.name,
    to: a.address,
    targetUsdc6: target,
    why: extra
      ? `stipend ${cfg.agentUsdc6} + treasury seed ${cfg.treasurySeed6}`
      : `agent stipend ${cfg.agentUsdc6}`,
  });
}

function pushDirectAgent(steps: FundStep[], a: FundWalletSnap, agentUsdc6: bigint): void {
  if (a.usdc6 >= agentUsdc6) {
    steps.push({ kind: "skip", name: a.name, why: `already >= ${agentUsdc6} base` });
    return;
  }
  steps.push({
    kind: "deployer-native",
    toName: a.name,
    to: a.address,
    targetUsdc6: agentUsdc6,
    why: "direct fan-out (no Circle mayor path)",
  });
}

function pushTreasuryStep(
  steps: FundStep[],
  input: {
    treasuryUsdc6: bigint;
    treasury: Address;
    cfg: FundAmounts;
    circle: boolean;
    ada: FundWalletSnap | undefined;
  },
): void {
  const { cfg } = input;
  if (input.treasuryUsdc6 >= cfg.treasurySeed6) {
    steps.push({ kind: "skip", name: "treasury", why: `already >= ${cfg.treasurySeed6} base` });
    return;
  }
  const adaTarget = input.ada
    ? agentTargetUsdc6(input.ada.name, input.treasuryUsdc6, cfg, input.circle)
    : cfg.agentUsdc6;
  const useTreasurer = Boolean(
    input.circle && input.ada?.walletId && adaTarget >= cfg.agentUsdc6 + cfg.treasurySeed6,
  );
  if (useTreasurer && input.ada?.walletId) {
    steps.push({
      kind: "circle-fund",
      fromName: input.ada.name,
      fromWalletId: input.ada.walletId,
      treasury: input.treasury,
      amountUsdc6: cfg.treasurySeed6,
    });
    return;
  }
  steps.push({
    kind: "deployer-fund",
    treasury: input.treasury,
    amountUsdc6: cfg.treasurySeed6,
  });
}

export function formatUsdc6(base: bigint): string {
  return `${base.toString()} (${toUsdcDecimalString(base)} USDC)`;
}

export function formatStep(step: FundStep): string {
  switch (step.kind) {
    case "faucet":
      return `faucet          ${step.toName.padEnd(7)} ${step.to}  optional ${CIRCLE_FAUCET_API} (non-fatal; ${CIRCLE_FAUCET_WEB})`;
    case "deployer-native":
      return `deployer-native ${step.toName.padEnd(7)} target ${formatUsdc6(step.targetUsdc6)}  native ${usdc6ToNative18(step.targetUsdc6).toString()} wei  ${step.why}`;
    case "circle-transfer":
      return `circle-transfer ${step.fromName}→${step.toName.padEnd(7)} target ${formatUsdc6(step.targetUsdc6)}  ${step.why}`;
    case "circle-fund":
      return `circle-fund    ${step.fromName.padEnd(7)} fund(${step.amountUsdc6.toString()})  ${step.treasury}`;
    case "deployer-fund":
      return `deployer-fund  fund(${step.amountUsdc6.toString()})  ${step.treasury}`;
    case "skip":
      return `skip            ${step.name.padEnd(7)} ${step.why}`;
  }
}

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

export function snapsFromRoster(roster: {
  wallets: Array<{ name: WalletName; address: string; walletId: string }>;
}): Omit<FundWalletSnap, "usdc6" | "native18">[] {
  if (roster.wallets.length > 0) {
    return roster.wallets.map((w) => ({
      name: w.name,
      address: w.address as Address,
      walletId: w.walletId,
    }));
  }
  return WALLET_NAMES.map((name) => ({ name, address: LIVE_FALLBACK_ADDRESSES[name] }));
}

export function resolveTreasuryAddress(
  env: Record<string, string | undefined> = process.env,
): Address {
  const fromEnv = env.TOWN_TREASURY_ADDRESS?.trim();
  if (fromEnv && ADDR_RE.test(fromEnv)) return fromEnv as Address;
  const p = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../contracts/deployments/arc-testnet.json",
  );
  try {
    const j = JSON.parse(readFileSync(p, "utf8")) as {
      contracts?: { TownTreasury?: string };
    };
    const a = j.contracts?.TownTreasury;
    if (typeof a === "string" && ADDR_RE.test(a)) return a as Address;
  } catch {
    // fall through to live pin
  }
  return LIVE_TREASURY_ADDRESS;
}

export async function requestCircleFaucet(input: {
  apiKey: string;
  address: string;
  blockchain?: string;
  fetch?: typeof fetch;
}): Promise<{ ok: boolean; status: number; detail: string }> {
  const fetchFn = input.fetch ?? globalThis.fetch;
  const res = await fetchFn(CIRCLE_FAUCET_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      address: input.address,
      blockchain: input.blockchain ?? ARC_TESTNET_BLOCKCHAIN,
      native: true,
      usdc: true,
    }),
  });
  if (res.status === 204) return { ok: true, status: 204, detail: "drip accepted" };
  let detail = res.statusText || `HTTP ${res.status}`;
  try {
    const j: unknown = await res.json();
    if (j && typeof j === "object" && "message" in j) {
      detail = String((j as { message: unknown }).message);
    }
  } catch {
    // keep statusText
  }
  return { ok: false, status: res.status, detail };
}
