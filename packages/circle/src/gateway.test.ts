import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ARC_USDC_ADDRESS } from "@agent-town/shared";
import type { CircleClient } from "./client.js";
import { ETH_SEPOLIA_BLOCKCHAIN } from "./client.js";
import { WalletRosterSchema } from "./roster.js";
import { EMPTY_ROSTER } from "./roster.js";
import {
  EXISTING_WALLET_SET_ID,
  GATEWAY_DEPOSIT_FN,
  GATEWAY_DEPOSIT_USDC_6,
  GATEWAY_DOMAIN_ARC,
  GATEWAY_DOMAIN_SEPOLIA,
  GATEWAY_WALLET_ADDRESS,
  GUS_SEPOLIA_REF_ID,
  SEPOLIA_GATEWAY_CONFIRMATIONS,
  SEPOLIA_USDC_ADDRESS,
  GATEWAY_APPROVE_FN,
  buildGatewayDepositPlan,
  buildGatewayGusPlan,
  buildGatewayTransferSpec,
  ensureGatewayGusWallet,
  executeGatewayDeposit,
  formatGatewayDepositPlan,
  formatGatewayGusPlan,
  gatewayWantsLive,
  pinWalletSetId,
  readGatewayGus,
  toGatewayGusArtifact,
  waitSepoliaConfirmations,
  writeGatewayGus,
} from "./gateway.js";

const ADDR = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function mockClient(over: Partial<CircleClient> = {}): CircleClient {
  return {
    createWalletSet: vi.fn(),
    getWalletSet: vi.fn(),
    createWallets: vi.fn(async () => ({
      data: {
        wallets: [
          {
            id: "w-gus-sepolia",
            address: ADDR,
            blockchain: ETH_SEPOLIA_BLOCKCHAIN,
            refId: GUS_SEPOLIA_REF_ID,
            name: GUS_SEPOLIA_REF_ID,
          },
        ],
      },
    })),
    listWallets: vi.fn(async () => ({ data: { wallets: [] } })),
    createContractExecutionTransaction: vi.fn(async () => ({
      data: { id: "tx-exec", state: "INITIATED" },
    })),
    createTransaction: vi.fn(),
    getTransaction: vi.fn(async () => ({
      data: { transaction: { id: "tx-exec", state: "COMPLETE", txHash: "0xabc" } },
    })),
    getWalletTokenBalance: vi.fn(),
    ...over,
  };
}

describe("gateway CLI gates", () => {
  it("dry-run is the default; --yes is required to call Circle", () => {
    expect(gatewayWantsLive({})).toBe(false);
    expect(gatewayWantsLive({ dryRun: true })).toBe(false);
    expect(gatewayWantsLive({ yes: true, dryRun: true })).toBe(false);
    expect(gatewayWantsLive({ yes: true })).toBe(true);
  });
});

describe("setup-gateway-gus plan", () => {
  it("prints ETH-SEPOLIA + gus-eth-sepolia + pinned set; never Arc gus refId", () => {
    const plan = buildGatewayGusPlan({ artifact: null, artifactPath: "/tmp/gateway-gus.json" });
    expect(plan.blockchain).toBe("ETH-SEPOLIA");
    expect(plan.refId).toBe("gus-eth-sepolia");
    expect(plan.refId).not.toBe("gus");
    expect(plan.walletSetId).toBe(EXISTING_WALLET_SET_ID);
    expect(plan.usdc).toBe(SEPOLIA_USDC_ADDRESS);
    expect(plan.usdc.toLowerCase()).not.toBe(ARC_USDC_ADDRESS.toLowerCase());
    expect(plan.willCreate).toBe(true);
    const text = formatGatewayGusPlan(plan);
    expect(text).toMatch(/ETH-SEPOLIA/);
    expect(text).toMatch(/gus-eth-sepolia/);
    expect(text).toMatch(/NOT gus/);
    expect(text).toMatch(/never create/);
    expect(text).toMatch(/not ENS MockUSDC/);
  });

  it("idempotent skip create when artifact already has the Sepolia SCA", () => {
    const artifact = toGatewayGusArtifact({
      walletSetId: EXISTING_WALLET_SET_ID,
      walletId: "w-1",
      address: ADDR,
    });
    const plan = buildGatewayGusPlan({ artifact });
    expect(plan.willCreate).toBe(false);
    expect(plan.existingAddress).toBe(ADDR);
    expect(formatGatewayGusPlan(plan)).toMatch(/idempotent skip create/);
  });

  it("refuses a different wallet set id", () => {
    expect(() => pinWalletSetId("not-the-pinned-set")).toThrow(/refusing to mix sets/);
    expect(pinWalletSetId(EXISTING_WALLET_SET_ID)).toBe(EXISTING_WALLET_SET_ID);
    expect(pinWalletSetId(null)).toBe(EXISTING_WALLET_SET_ID);
  });
});

describe("ensureGatewayGusWallet", () => {
  it("creates one SCA on ETH-SEPOLIA with refId gus-eth-sepolia", async () => {
    const c = mockClient();
    const r = await ensureGatewayGusWallet(c, EXISTING_WALLET_SET_ID);
    expect(r.created).toBe(true);
    expect(r.recovered).toBe(false);
    expect(r.address).toBe(ADDR);
    expect(c.createWallets).toHaveBeenCalledWith({
      walletSetId: EXISTING_WALLET_SET_ID,
      accountType: "SCA",
      blockchains: ["ETH-SEPOLIA"],
      count: 1,
      metadata: [{ name: GUS_SEPOLIA_REF_ID, refId: GUS_SEPOLIA_REF_ID }],
    });
    expect(c.listWallets).toHaveBeenCalledWith({
      walletSetId: EXISTING_WALLET_SET_ID,
      refId: GUS_SEPOLIA_REF_ID,
      blockchain: ETH_SEPOLIA_BLOCKCHAIN,
    });
    const payload = vi.mocked(c.createWallets).mock.calls[0]?.[0];
    expect(payload?.metadata?.[0]?.refId).not.toBe("gus");
  });

  it("is idempotent: listWallets hit skips createWallets", async () => {
    const c = mockClient({
      listWallets: vi.fn(async () => ({
        data: {
          wallets: [
            {
              id: "w-existing",
              address: ADDR,
              blockchain: ETH_SEPOLIA_BLOCKCHAIN,
              refId: GUS_SEPOLIA_REF_ID,
            },
          ],
        },
      })),
    });
    const r = await ensureGatewayGusWallet(c, EXISTING_WALLET_SET_ID);
    expect(r).toEqual({
      walletId: "w-existing",
      address: ADDR,
      created: false,
      recovered: true,
    });
    expect(c.createWallets).not.toHaveBeenCalled();
  });

  it("throws if createWallets returns nothing", async () => {
    const c = mockClient({ createWallets: vi.fn(async () => ({ data: { wallets: [] } })) });
    await expect(ensureGatewayGusWallet(c, EXISTING_WALLET_SET_ID)).rejects.toThrow(/no ETH-SEPOLIA/);
  });
});

describe("gateway-gus.json does not break WalletRosterSchema", () => {
  it("round-trips and roster schema still rejects ETH-SEPOLIA", () => {
    const dir = mkdtempSync(join(tmpdir(), "gateway-gus-"));
    const p = join(dir, "gateway-gus.json");
    writeGatewayGus(
      toGatewayGusArtifact({
        walletSetId: EXISTING_WALLET_SET_ID,
        walletId: "w-1",
        address: ADDR,
      }),
      p,
    );
    expect(readFileSync(p, "utf8").endsWith("}\n")).toBe(true);
    const a = readGatewayGus(p);
    expect(a?.refId).toBe("gus-eth-sepolia");
    expect(a?.address).toBe(ADDR);
    expect(() =>
      WalletRosterSchema.parse({ ...EMPTY_ROSTER, blockchain: "ETH-SEPOLIA" }),
    ).toThrow();
  });
});

describe("Gateway deposit plan", () => {
  it("is approve then deposit(token,amount) on GatewayWallet — not ERC-20 transfer", () => {
    const plan = buildGatewayDepositPlan();
    expect(plan.amountUsdc6).toBe(GATEWAY_DEPOSIT_USDC_6);
    expect(plan.steps.map((s) => s.kind)).toEqual(["approve", "deposit"]);
    expect(plan.steps[0]).toMatchObject({
      kind: "approve",
      fn: GATEWAY_APPROVE_FN,
      token: SEPOLIA_USDC_ADDRESS,
      spender: GATEWAY_WALLET_ADDRESS,
    });
    expect(plan.steps[1]).toMatchObject({
      kind: "deposit",
      fn: GATEWAY_DEPOSIT_FN,
      gateway: GATEWAY_WALLET_ADDRESS,
      token: SEPOLIA_USDC_ADDRESS,
    });
    const text = formatGatewayDepositPlan(plan);
    expect(text).toMatch(/NOT an ERC-20 transfer/);
    expect(text).toMatch(SEPOLIA_USDC_ADDRESS);
    expect(text).not.toMatch(/0x3600000000000000000000000000000000000000/);
  });

  it("executeGatewayDeposit submits approve then deposit via contract execution", async () => {
    const ids = ["tx-approve", "tx-deposit"];
    let i = 0;
    const c = mockClient({
      createContractExecutionTransaction: vi.fn(async () => ({
        data: { id: ids[i++] ?? "tx-x", state: "INITIATED" },
      })),
      getTransaction: vi.fn(async ({ id }) => ({
        data: { transaction: { id, state: "COMPLETE", txHash: `0x${id}` } },
      })),
    });
    const r = await executeGatewayDeposit(c, { walletId: "w-gus-sepolia", wait: { pollMs: 1, sleep: async () => {} } });
    expect(r.approveTxId).toBe("tx-approve");
    expect(r.depositTxId).toBe("tx-deposit");
    expect(c.createContractExecutionTransaction).toHaveBeenCalledTimes(2);
    expect(c.createTransaction).not.toHaveBeenCalled();
    expect(c.createContractExecutionTransaction).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        walletId: "w-gus-sepolia",
        contractAddress: SEPOLIA_USDC_ADDRESS,
        abiFunctionSignature: GATEWAY_APPROVE_FN,
        abiParameters: [GATEWAY_WALLET_ADDRESS, GATEWAY_DEPOSIT_USDC_6.toString()],
      }),
    );
    expect(c.createContractExecutionTransaction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        walletId: "w-gus-sepolia",
        contractAddress: GATEWAY_WALLET_ADDRESS,
        abiFunctionSignature: GATEWAY_DEPOSIT_FN,
        abiParameters: [SEPOLIA_USDC_ADDRESS, GATEWAY_DEPOSIT_USDC_6.toString()],
      }),
    );
  });
});

describe("Sepolia confirmation wait", () => {
  it("returns once current >= fromBlock + 65", async () => {
    let n = 100n;
    const r = await waitSepoliaConfirmations({
      fromBlock: 100n,
      getBlockNumber: async () => {
        n += 70n;
        return n;
      },
      sleep: async () => {},
    });
    expect(SEPOLIA_GATEWAY_CONFIRMATIONS).toBe(65);
    expect(r.current).toBeGreaterThanOrEqual(165n);
  });
});

describe("Gateway transfer spec Sepolia → Arc", () => {
  it("uses domain 0 → 26 and Circle Sepolia USDC → Arc USDC", () => {
    const spec = buildGatewayTransferSpec({
      depositor: ADDR,
      recipient: "0xce0ed3b88f60eefb8ea77d1daec5cee3a9e4ffc1",
      valueUsdc6: 1_000_000n,
      salt: `0x${"11".repeat(32)}`,
    });
    expect(spec.sourceDomain).toBe(GATEWAY_DOMAIN_SEPOLIA);
    expect(spec.destinationDomain).toBe(GATEWAY_DOMAIN_ARC);
    expect(spec.sourceToken).toMatch(SEPOLIA_USDC_ADDRESS.slice(2).toLowerCase());
    expect(spec.destinationToken).toMatch(ARC_USDC_ADDRESS.slice(2).toLowerCase());
  });
});
