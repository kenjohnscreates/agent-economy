// M2.5 client: live resolveAgent(ada), mocked writes re-read getState, no cached tokenId.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AGENT_NAMES, ENS_KEYS } from "@agent-town/shared";
import { createPublicClient, getAddress, http, toFunctionSelector, zeroAddress } from "viem";
import { sepolia } from "viem/chains";
import { describe, expect, it, vi } from "vitest";
import { townResolverAbi, UNREGISTER_SELECTOR } from "./abi/index.js";
import {
  appendReview,
  createEnsClient,
  normalizeAgentName,
  resolveAgent,
  revokeName,
  setCreditScore,
  type EnsPublicClient,
  type EnsWalletClient,
} from "./client.js";
import { addresses } from "./deployments.js";
import { dnsEncodeName } from "./records.js";
import { town, townAddresses } from "./town.js";

const ADA = getAddress("0x97847b3c015994784ae8cf776ef9a4d563618cf2");
const TREASURER = getAddress("0xD428294070595052d9E0607f28CDf51b52156d2A");
const DEE = getAddress("0x70b1300425c37af893ca4841e4183e7f0a1bdb89");
const LIVE_TOKEN = 0xfeed_facen; // distinctive — must come from getState, not labelhash

function walletsFromRosterJson(): Record<(typeof AGENT_NAMES)[number], `0x${string}`> {
  const path = fileURLToPath(new URL("../../circle/roster.json", import.meta.url));
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    wallets: { name: string; address: string }[];
  };
  const out = {} as Record<(typeof AGENT_NAMES)[number], `0x${string}`>;
  for (const n of AGENT_NAMES) {
    const w = raw.wallets.find((x) => x.name === n);
    if (!w) throw new Error(`roster.json missing ${n}`);
    out[n] = w.address as `0x${string}`;
  }
  return out;
}

function mockWallet(): EnsWalletClient {
  return {
    account: { address: TREASURER, type: "json-rpc" },
    writeContract: vi.fn(async () => "0x" as `0x${string}`),
  } as unknown as EnsWalletClient;
}

function mockPublic(read: unknown, simulate: unknown): EnsPublicClient {
  return { readContract: read, simulateContract: simulate } as unknown as EnsPublicClient;
}

function registeredState() {
  return {
    status: 2,
    expiry: 1_820_496_672,
    latestOwner: ADA,
    tokenId: LIVE_TOKEN,
    resource: LIVE_TOKEN,
  };
}

describe("normalizeAgentName", () => {
  it("accepts ada and ada.botanica.eth", () => {
    const a = normalizeAgentName("ada");
    const b = normalizeAgentName("ada.botanica.eth");
    expect(a).toEqual(b);
    expect(a.label).toBe("ada");
    expect(a.ensName).toBe("ada.botanica.eth");
    expect(a.dnsName).toBe(dnsEncodeName("ada.botanica.eth"));
  });
});

describe("createEnsClient surface (R3)", () => {
  it("has no tokenId field on the client or ResolvedAgent shape", async () => {
    const order: string[] = [];
    const publicClient = mockPublic(
      vi.fn(async ({ functionName }: { functionName: string }) => {
        order.push(String(functionName));
        if (functionName === "getState") return registeredState();
        return "0x";
      }),
      vi.fn(async (req: { functionName: string }) => {
        order.push(`sim:${req.functionName}`);
        return { request: req };
      }),
    );
    const ens = createEnsClient({ publicClient, walletClient: mockWallet() });
    expect(ens).not.toHaveProperty("tokenId");
    expect(Object.keys(ens).sort()).toEqual(
      ["appendReview", "resolveAgent", "revokeName", "setCreditScore"].sort(),
    );
    await ens.setCreditScore("ada", 80);
    expect(order[0]).toBe("getState");
  });
});

describe("setCreditScore / appendReview / revokeName (mocked)", () => {
  it("re-reads getState before setCreditScore and does not broadcast", async () => {
    const order: string[] = [];
    const wallet = mockWallet();
    const publicClient = mockPublic(
      vi.fn(async ({ functionName }: { functionName: string }) => {
        order.push(`read:${String(functionName)}`);
        if (functionName === "getState") return registeredState();
        return "0x";
      }),
      vi.fn(async (req: { functionName: string; args: unknown[] }) => {
        order.push(`sim:${req.functionName}`);
        expect(req.functionName).toBe("setText");
        expect(req.args[1]).toBe(ENS_KEYS.creditScore);
        expect(req.args[2]).toBe("80");
        return { request: req };
      }),
    );
    const result = await setCreditScore("ada", 80, { publicClient, walletClient: wallet });
    expect(result.simulated).toBe(true);
    expect(result).not.toHaveProperty("tokenId");
    expect(order[0]).toBe("read:getState");
    expect(order.indexOf("read:getState")).toBeLessThan(order.indexOf("sim:setText"));
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("rejects scores outside 0–100", async () => {
    const read = vi.fn();
    const publicClient = mockPublic(read, vi.fn());
    await expect(
      setCreditScore("ada", 101, { publicClient, walletClient: mockWallet() }),
    ).rejects.toThrow(/0–100/);
    expect(read).not.toHaveBeenCalled();
  });

  it("re-reads getState then current town.reviews before appendReview", async () => {
    const order: string[] = [];
    const wallet = mockWallet();
    const existing =
      "0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000025b5d000000000000000000000000000000000000000000000000000000000000" as const;
    const publicClient = mockPublic(
      vi.fn(async ({ functionName }: { functionName: string }) => {
        order.push(`read:${String(functionName)}`);
        if (functionName === "getState") return registeredState();
        if (functionName === "resolve") return [existing, townAddresses.TownResolver];
        return "0x";
      }),
      vi.fn(async (req: { functionName: string; args: unknown[] }) => {
        order.push(`sim:${req.functionName}`);
        expect(req.args[1]).toBe(ENS_KEYS.reviews);
        const parsed = JSON.parse(String(req.args[2])) as unknown[];
        expect(parsed).toEqual([{ by: "ada", tick: 3, score: 70, note: "ok" }]);
        return { request: req };
      }),
    );
    const result = await appendReview(
      "bo",
      { by: "ada", tick: 3, score: 70, note: "ok" },
      { publicClient, walletClient: wallet },
    );
    expect(result.simulated).toBe(true);
    expect(order[0]).toBe("read:getState");
    expect(order).toContain("read:resolve");
    expect(order.indexOf("read:getState")).toBeLessThan(order.indexOf("read:resolve"));
    expect(order.indexOf("read:resolve")).toBeLessThan(order.indexOf("sim:setText"));
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("revokeName unregisters with the live getState tokenId and does not persist it", async () => {
    const wallet = mockWallet();
    let seenId: bigint | undefined;
    const publicClient = mockPublic(
      vi.fn(async ({ functionName }: { functionName: string }) => {
        if (functionName === "getState") return registeredState();
        return "0x";
      }),
      vi.fn(async (req: { functionName: string; args: unknown[] }) => {
        expect(req.functionName).toBe("unregister");
        seenId = req.args[0] as bigint;
        expect(seenId).toBe(LIVE_TOKEN);
        return { request: req };
      }),
    );
    const result = await revokeName("ada", { publicClient, walletClient: wallet });
    expect(result.simulated).toBe(true);
    expect(result).not.toHaveProperty("tokenId");
    expect(seenId).toBe(LIVE_TOKEN);
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("refuses to send even with broadcast:true unless ALLOW_BROADCAST=true", async () => {
    const wallet = mockWallet();
    const publicClient = mockPublic(
      vi.fn(async () => registeredState()),
      vi.fn(async (req: unknown) => ({ request: req })),
    );
    await setCreditScore("ada", 10, { publicClient, walletClient: wallet, broadcast: true });
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });
});

describe("resolveAgent (live Sepolia)", () => {
  it("ada.botanica.eth Arc+60 match roster ada wallet", async (ctx) => {
    if (!process.env.SEPOLIA_RPC_URL) {
      ctx.skip();
      return;
    }
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(process.env.SEPOLIA_RPC_URL, { timeout: 12_000, retryCount: 0 }),
    });
    const agent = await resolveAgent("ada", { publicClient });
    const roster = walletsFromRosterJson();
    expect(agent.ensName).toBe("ada.botanica.eth");
    expect(agent.wallet).toBe(getAddress(roster.ada!));
    expect(agent.wallet60).toBe(getAddress(roster.ada!));
    expect(agent.role).toBe("treasurer");
    expect(agent.avatar).toContain("/sprites/ada.png");
    expect(agent.agentContext).toContain("ada.botanica.eth");
    expect(agent).not.toHaveProperty("tokenId");
  }, 20_000);
});

describe("negative: worker cannot set town.credit-score (live sim)", () => {
  it("dee eth_call setText(town.credit-score) reverts", async (ctx) => {
    if (!process.env.SEPOLIA_RPC_URL) {
      ctx.skip();
      return;
    }
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(process.env.SEPOLIA_RPC_URL, { timeout: 12_000, retryCount: 0 }),
    });
    await expect(
      publicClient.simulateContract({
        address: townAddresses.TownResolver,
        abi: townResolverAbi,
        functionName: "setText",
        args: [dnsEncodeName("dee.botanica.eth"), ENS_KEYS.creditScore, "50"],
        account: DEE,
      }),
    ).rejects.toThrow();
  }, 15_000);
});

describe("hackathon UserRegistryImpl unregister selector", () => {
  it("bytecode contains unregister(uint256) 0xa02b161e", async (ctx) => {
    expect(UNREGISTER_SELECTOR).toBe(toFunctionSelector("function unregister(uint256 anyId)"));
    expect(UNREGISTER_SELECTOR).toBe("0xa02b161e");
    const client = createPublicClient({
      chain: sepolia,
      transport: http(
        process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
        { timeout: 8_000, retryCount: 0 },
      ),
    });
    let code: `0x${string}` | undefined;
    try {
      code = await client.getCode({ address: addresses.UserRegistryImpl });
    } catch {
      ctx.skip();
      return;
    }
    if (!code) {
      ctx.skip();
      return;
    }
    expect(code).toContain(UNREGISTER_SELECTOR.slice(2));
    expect(town.contracts.TownRegistry).not.toBe(zeroAddress);
  }, 15_000);
});
