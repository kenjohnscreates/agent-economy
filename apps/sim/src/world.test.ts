import { ARC_TESTNET_BLOCKCHAIN } from "@agent-town/circle";
import { describe, expect, it, vi } from "vitest";
import type { Address, PublicClient } from "viem";
import {
  MERCHANT_BASE_PRICE_USDC,
  createGetWorld,
  priceFromSignals,
  usdcBigint,
  type GetWorldDeps,
} from "./world.js";

const GUS = "0x55911428be619c98220da9d6d9575d311d3082dc" as Address;
const TREASURY = "0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1" as Address;

function testDeps(overrides: Partial<GetWorldDeps> = {}): GetWorldDeps {
  const readContract = vi.fn(async (args: { functionName: string; args?: readonly unknown[] }) => {
    if (args.functionName === "balanceOf") {
      const holder = (args.args?.[0] as string).toLowerCase();
      if (holder === GUS.toLowerCase()) return 2_000_000n;
      return 0n;
    }
    if (args.functionName === "stats") {
      return [1_000_000n, 4_000_000n, 1n, 0n, 610] as const;
    }
    if (args.functionName === "utilisationBps") return 2000;
    throw new Error(`unexpected readContract: ${args.functionName}`);
  });

  return {
    publicClient: { readContract } as unknown as PublicClient,
    roster: {
      blockchain: ARC_TESTNET_BLOCKCHAIN,
      accountType: "SCA",
      walletSetId: "test",
      wallets: [
        {
          name: "gus",
          walletId: "w-gus",
          address: GUS,
        },
      ],
    },
    treasuryAddress: TREASURY,
    fetchSignals: async () => ({
      usdcBorrowApyBps: 410,
      dexVolume24hUsd: "50000000",
      stale: false,
    }),
    ...overrides,
  };
}

describe("getWorld", () => {
  it("returns gus ERC-20 balance and a nonzero merchant price from Signal C", async () => {
    const getWorld = createGetWorld(testDeps());
    const world = await getWorld(1);

    expect(world.balances.gus).toBe("2000000");
    expect(usdcBigint(world.merchantPriceUsdc)).toBeGreaterThan(0n);
    expect(world.merchantPriceUsdc).toBe(
      priceFromSignals(MERCHANT_BASE_PRICE_USDC, "50000000"),
    );
    expect(world.signals.usdcBorrowApyBps).toBe(410);
    expect(world.treasury.baseRateBps).toBe(610);
  });

  it("falls back to computed town rate when treasury eth_call fails", async () => {
    const failingClient = {
      readContract: vi.fn(async (args: { functionName: string }) => {
        if (args.functionName === "balanceOf") return 1_000_000n;
        throw new Error("rpc down");
      }),
    } as unknown as PublicClient;

    const getWorld = createGetWorld(
      testDeps({
        publicClient: failingClient,
        fetchSignals: async () => ({
          usdcBorrowApyBps: 410,
          dexVolume24hUsd: "0",
          stale: true,
        }),
      }),
    );

    const world = await getWorld(2);
    expect(world.treasury.baseRateBps).toBe(610);
    expect(world.merchantPriceUsdc).toBe(MERCHANT_BASE_PRICE_USDC);
  });
});

describe("getWorld jobs", () => {
  const BO = "0x337512e3f78e9ad91493a98143b511c46c3775f7" as Address;
  const DEE = "0x70b1300425c37af893ca4841e4183e7f0a1bdb89" as Address;
  const FOREIGN = "0x1111111111111111111111111111111111111111";

  function jobRoster(): GetWorldDeps["roster"] {
    return {
      blockchain: ARC_TESTNET_BLOCKCHAIN,
      accountType: "SCA",
      walletSetId: "test",
      wallets: [
        { name: "gus", walletId: "w-gus", address: GUS },
        { name: "bo", walletId: "w-bo", address: BO },
        { name: "dee", walletId: "w-dee", address: DEE },
      ],
    };
  }

  it("hydrates assignments from roster worker provider; keeps foreign provider non-empty", async () => {
    const getWorld = createGetWorld(
      testDeps({
        roster: jobRoster(),
        fetchSubgraph: async () => ({
          jobs: [
            {
              id: "185764",
              amount: "1200000",
              status: "funded",
              createdAt: "1",
              settledAt: null,
              client: { id: BO, ensName: "bo.botanica.eth" },
              provider: { id: DEE, ensName: "dee.botanica.eth" },
            },
            {
              id: "185900",
              amount: "500000",
              status: "funded",
              createdAt: "1",
              settledAt: null,
              client: { id: BO, ensName: "bo.botanica.eth" },
              provider: { id: FOREIGN, ensName: null },
            },
          ],
        }),
      }),
    );
    const world = await getWorld(4);
    expect(world.jobs.find((j) => j.id === "185764")).toMatchObject({
      client: "bo",
      provider: "dee",
      status: "funded",
    });
    expect(world.assignments).toContainEqual({
      jobId: "185764",
      worker: "dee",
      acceptedAtTick: 3,
    });
    expect(world.jobs.find((j) => j.id === "185900")?.provider).toBe(FOREIGN);
    expect(world.assignments.some((a) => a.jobId === "185900")).toBe(false);
  });
});
