import { describe, expect, it, vi } from "vitest";
import { toUsdcDecimalString } from "./amounts.js";
import {
  AGENT_USDC_6,
  LIVE_FALLBACK_ADDRESSES,
  LIVE_TREASURY_ADDRESS,
  MAYOR_GAS_RESERVE_6,
  TREASURER_NAME,
  TREASURY_SEED_6,
  USDC_6_TO_NATIVE_18,
  agentTargetUsdc6,
  buildFundPlan,
  formatStep,
  gapUsdc6,
  mayorSeedUsdc6,
  native18ToUsdc6,
  requestCircleFaucet,
  resolveTreasuryAddress,
  snapsFromRoster,
  usdc6ToNative18,
  type FundWalletSnap,
} from "./fund.js";
import { MAYOR_NAME, WALLET_NAMES } from "./roster.js";

const TREASURY = LIVE_TREASURY_ADDRESS;
const ID = (n: string) => `id-${n}`;

function snap(
  name: FundWalletSnap["name"],
  usdc6 = 0n,
  native18 = 0n,
  withId = true,
): FundWalletSnap {
  return {
    name,
    address: LIVE_FALLBACK_ADDRESSES[name],
    walletId: withId ? ID(name) : undefined,
    usdc6,
    native18,
  };
}

function allZero(withId = true): FundWalletSnap[] {
  return WALLET_NAMES.map((n) => snap(n, 0n, 0n, withId));
}

describe("6-vs-18 conversion (same USDC, never mix raw values)", () => {
  it("2 USDC is 2000000 (6-dec) and 2e18 (18-dec), factor 1e12", () => {
    expect(AGENT_USDC_6).toBe(2_000_000n);
    expect(usdc6ToNative18(AGENT_USDC_6)).toBe(2_000_000_000_000_000_000n);
    expect(native18ToUsdc6(2_000_000_000_000_000_000n)).toBe(AGENT_USDC_6);
    expect(USDC_6_TO_NATIVE_18).toBe(1_000_000_000_000n);
    expect(toUsdcDecimalString(AGENT_USDC_6)).toBe("2");
  });

  it("rejects negatives and truncates sub-micro native dust", () => {
    expect(() => usdc6ToNative18(-1n)).toThrow(/negative/);
    expect(native18ToUsdc6(USDC_6_TO_NATIVE_18 - 1n)).toBe(0n);
    expect(gapUsdc6(1_000_000n, AGENT_USDC_6)).toBe(1_000_000n);
    expect(gapUsdc6(AGENT_USDC_6, AGENT_USDC_6)).toBe(0n);
  });
});

describe("buildFundPlan — Circle fan-out (first fill)", () => {
  it("faucets mayor, native-seeds mayor, Circle-transfers 8 agents, treasurer fund()", () => {
    const wallets = allZero(true);
    const plan = buildFundPlan({
      wallets,
      treasuryUsdc6: 0n,
      treasury: TREASURY,
      preferCircle: true,
    });
    expect(TREASURER_NAME).toBe("ada");
    expect(plan.preferCircle).toBe(true);
    const kinds = plan.steps.map((s) => s.kind);
    expect(kinds[0]).toBe("faucet");
    expect(kinds.filter((k) => k === "circle-transfer")).toHaveLength(8);
    expect(kinds.filter((k) => k === "circle-fund")).toEqual(["circle-fund"]);
    expect(kinds).not.toContain("deployer-fund");

    const mayorStep = plan.steps.find((s) => s.kind === "deployer-native");
    expect(mayorStep).toMatchObject({ kind: "deployer-native", toName: MAYOR_NAME });
    // 7×2 + ada 5 + 0.5 reserve = 19.5 USDC
    expect(plan.mayorTarget6).toBe(7n * AGENT_USDC_6 + AGENT_USDC_6 + TREASURY_SEED_6 + MAYOR_GAS_RESERVE_6);
    expect(plan.mayorTarget6).toBe(19_500_000n);

    const adaXfer = plan.steps.find((s) => s.kind === "circle-transfer" && s.toName === "ada");
    expect(adaXfer).toMatchObject({ kind: "circle-transfer", targetUsdc6: 5_000_000n });
    const boXfer = plan.steps.find((s) => s.kind === "circle-transfer" && s.toName === "bo");
    expect(boXfer).toMatchObject({ kind: "circle-transfer", targetUsdc6: AGENT_USDC_6 });

    const fund = plan.steps.find((s) => s.kind === "circle-fund");
    expect(fund).toMatchObject({
      kind: "circle-fund",
      fromName: "ada",
      amountUsdc6: TREASURY_SEED_6,
      treasury: TREASURY,
    });
  });

  it("dry-run strings print 6-dec base units", () => {
    const plan = buildFundPlan({
      wallets: allZero(true),
      treasuryUsdc6: 0n,
      treasury: TREASURY,
      preferCircle: true,
    });
    const lines = plan.steps.map(formatStep).join("\n");
    expect(lines).toContain("target 2000000 (2 USDC)");
    expect(lines).toContain("target 5000000 (5 USDC)");
    expect(lines).toContain("fund(3000000)");
    expect(lines).toContain("native 19500000000000000000 wei");
  });
});

describe("buildFundPlan — idempotent / fallbacks", () => {
  it("skips funded agents and treasury; no faucet when mayor already has USDC", () => {
    const wallets = WALLET_NAMES.map((n) =>
      snap(n, n === MAYOR_NAME ? 20_000_000n : AGENT_USDC_6, usdc6ToNative18(AGENT_USDC_6)),
    );
    const plan = buildFundPlan({
      wallets,
      treasuryUsdc6: TREASURY_SEED_6,
      treasury: TREASURY,
      preferCircle: true,
    });
    expect(plan.steps.every((s) => s.kind === "skip")).toBe(true);
    expect(plan.steps.some((s) => s.kind === "faucet")).toBe(false);
  });

  it("without wallet ids, deployer native-sends agents and deployer fund()", () => {
    const plan = buildFundPlan({
      wallets: allZero(false),
      treasuryUsdc6: 0n,
      treasury: TREASURY,
      preferCircle: true, // ignored — no wallet ids
    });
    expect(plan.preferCircle).toBe(false);
    expect(plan.steps.filter((s) => s.kind === "faucet")).toHaveLength(1);
    expect(plan.steps.filter((s) => s.kind === "deployer-native")).toHaveLength(8);
    expect(plan.steps.filter((s) => s.kind === "circle-transfer")).toHaveLength(0);
    expect(plan.steps.some((s) => s.kind === "deployer-fund")).toBe(true);
    expect(plan.steps.some((s) => s.kind === "circle-fund")).toBe(false);
    const ada = plan.steps.find((s) => s.kind === "deployer-native" && s.toName === "ada");
    expect(ada).toMatchObject({ targetUsdc6: AGENT_USDC_6 });
  });

  it("agents at stipend, treasury empty → extra to ada then circle-fund", () => {
    const wallets = WALLET_NAMES.map((n) =>
      n === MAYOR_NAME
        ? snap(n, 0n, 0n)
        : snap(n, AGENT_USDC_6, usdc6ToNative18(AGENT_USDC_6)),
    );
    const plan = buildFundPlan({
      wallets,
      treasuryUsdc6: 0n,
      treasury: TREASURY,
      preferCircle: true,
    });
    const ada = plan.steps.find((s) => s.kind === "circle-transfer" && s.toName === "ada");
    expect(ada).toMatchObject({ targetUsdc6: AGENT_USDC_6 + TREASURY_SEED_6 });
    expect(plan.steps.filter((s) => s.kind === "skip" && s.name !== "mayor")).toHaveLength(7);
    expect(plan.steps.some((s) => s.kind === "circle-fund")).toBe(true);
  });
});

describe("targets + treasury address", () => {
  it("agentTarget / mayorSeed match the first-fill budget", () => {
    expect(agentTargetUsdc6("bo", 0n, undefined, true)).toBe(AGENT_USDC_6);
    expect(agentTargetUsdc6("ada", 0n, undefined, true)).toBe(AGENT_USDC_6 + TREASURY_SEED_6);
    expect(agentTargetUsdc6("ada", 0n, undefined, false)).toBe(AGENT_USDC_6);
    expect(agentTargetUsdc6("ada", TREASURY_SEED_6, undefined, true)).toBe(AGENT_USDC_6);
    const wallets = allZero(true);
    expect(mayorSeedUsdc6(wallets, 0n)).toBe(19_500_000n);
  });

  it("resolveTreasuryAddress prefers env, then deployments file, then live pin", () => {
    expect(resolveTreasuryAddress({ TOWN_TREASURY_ADDRESS: TREASURY })).toBe(TREASURY);
    expect(resolveTreasuryAddress({ TOWN_TREASURY_ADDRESS: "nope" })).toBe(TREASURY);
    expect(resolveTreasuryAddress({})).toBe(TREASURY);
  });

  it("snapsFromRoster uses live addresses when roster.wallets is empty", () => {
    const empty = snapsFromRoster({ wallets: [] });
    expect(empty).toHaveLength(9);
    expect(empty.find((w) => w.name === "mayor")?.address).toBe(LIVE_FALLBACK_ADDRESSES.mayor);
    expect(empty[0]?.walletId).toBeUndefined();
    const filled = snapsFromRoster({
      wallets: [{ name: "mayor", address: LIVE_FALLBACK_ADDRESSES.mayor, walletId: "w" }],
    });
    expect(filled).toEqual([
      { name: "mayor", address: LIVE_FALLBACK_ADDRESSES.mayor, walletId: "w" },
    ]);
  });
});

describe("requestCircleFaucet", () => {
  it("treats 204 as success and never puts the key in the result", async () => {
    const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toMatch(/\/v1\/faucet\/drips$/);
      const hdr = new Headers(init?.headers);
      expect(hdr.get("Authorization")).toBe("Bearer SECRETKEY");
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    const r = await requestCircleFaucet({
      apiKey: "SECRETKEY",
      address: LIVE_FALLBACK_ADDRESSES.mayor,
      fetch: fetchFn,
    });
    expect(r).toEqual({ ok: true, status: 204, detail: "drip accepted" });
    expect(JSON.stringify(r)).not.toContain("SECRETKEY");
  });

  it("surfaces Circle error message on failure (still no key)", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "upgrade to mainnet" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    const r = await requestCircleFaucet({
      apiKey: "SECRETKEY",
      address: LIVE_FALLBACK_ADDRESSES.mayor,
      fetch: fetchFn,
    });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/upgrade to mainnet/);
    expect(r.detail).not.toContain("SECRETKEY");
  });
});
