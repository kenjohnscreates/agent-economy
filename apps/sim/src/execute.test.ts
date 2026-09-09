// M4.3 — mocked Circle client; dry-run gate; failure surfaces as ledger failed.
import { ARC_USDC_ADDRESS } from "@agent-town/shared";
import { describe, expect, it, vi } from "vitest";
import {
  ARC_TESTNET_BLOCKCHAIN,
  CircleTxTimeout,
  type CircleClient,
  type CircleTx,
  type WalletRoster,
} from "@agent-town/circle";
import { parseSimConfig, resolveExecuteEnabled } from "./config.js";
import { runSingleTick } from "./engine.js";
import { executeProposedAction, createExecuteAction } from "./execute.js";
import { MemoryLedger } from "./ledger/index.js";
import { loadWorld } from "./world.js";

const tx = (state: string, extra: Partial<CircleTx> = {}): CircleTx => ({
  id: "tx-1",
  state,
  ...extra,
});

function mockClient(over: Partial<CircleClient> = {}): CircleClient {
  return {
    createWalletSet: vi.fn(),
    getWalletSet: vi.fn(),
    createWallets: vi.fn(),
    listWallets: vi.fn(),
    createContractExecutionTransaction: vi.fn(async () => ({
      data: { id: "tx-exec", state: "INITIATED" },
    })),
    createTransaction: vi.fn(async () => ({ data: { id: "tx-xfer", state: "INITIATED" } })),
    getTransaction: vi.fn(async () => ({
      data: { transaction: tx("COMPLETE", { txHash: "0xabc" }) },
    })),
    getWalletTokenBalance: vi.fn(),
    ...over,
  };
}

const testRoster: WalletRoster = {
  blockchain: ARC_TESTNET_BLOCKCHAIN,
  accountType: "SCA",
  walletSetId: "ws-test",
  wallets: [
    { name: "gus", walletId: "w-gus", address: "0x55911428be619c98220da9d6d9575d311d3082dc" },
    { name: "bo", walletId: "w-bo", address: "0x337512e3f78e9ad91493a98143b511c46c3775f7" },
    { name: "ada", walletId: "w-ada", address: "0x97847b3c015994784ae8cf776ef9a4d563618cf2" },
    { name: "dee", walletId: "w-dee", address: "0x70b1300425c37af893ca4841e4183e7f0a1bdb89" },
    { name: "cy", walletId: "w-cy", address: "0xc0469ad2ee2acac0c9bd50e07481a5325f9c8950" },
    { name: "eli", walletId: "w-eli", address: "0x216ad8633cbcd6f63d6f79fcb5ae40bc5fe829dd" },
    { name: "fay", walletId: "w-fay", address: "0xff7be88f27d518fdb80c8c7c9031894e21e37038" },
    { name: "hal", walletId: "w-hal", address: "0x8214a5d688494e04c4a67c0b299706ec61dbc469" },
    { name: "mayor", walletId: "w-mayor", address: "0x52b9c05db4866da39567a4f9f06fac448ea30685" },
  ],
};

const treasury = "0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1" as const;
const jobs = "0x0747EEf0706327138c69792bF28Cd525089e4583" as const;

function deps(client: CircleClient) {
  return {
    client,
    roster: testRoster,
    treasuryAddress: treasury,
    jobsAddress: jobs,
    uuid: () => "test-idem-key",
  };
}

describe("executeProposedAction (mocked Circle)", () => {
  it("buy → transferUsdc with 6-dec amount and ARC-TESTNET", async () => {
    const client = mockClient();
    const result = await executeProposedAction(
      {
        tick: 1,
        agent: "gus",
        action: { kind: "buy", amountUsdc: "500000", to: "bo" },
      },
      deps(client),
    );
    expect(result).toEqual({ status: "complete", txHash: "0xabc", txId: "tx-xfer" });
    expect(client.createTransaction).toHaveBeenCalledWith({
      walletId: "w-gus",
      tokenAddress: ARC_USDC_ADDRESS,
      blockchain: ARC_TESTNET_BLOCKCHAIN,
      destinationAddress: testRoster.wallets.find((w) => w.name === "bo")!.address,
      amount: ["0.5"],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      idempotencyKey: "test-idem-key",
    });
    expect(client.createContractExecutionTransaction).not.toHaveBeenCalled();
  });

  it("deposit → approve on USDC then treasury deposit (6-dec)", async () => {
    const client = mockClient();
    const result = await executeProposedAction(
      {
        tick: 2,
        agent: "dee",
        action: { kind: "deposit", amountUsdc: "240000" },
      },
      deps(client),
    );
    expect(result.status).toBe("complete");
    expect(client.createContractExecutionTransaction).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(client.createContractExecutionTransaction).mock.calls;
    expect(calls[0]?.[0]).toMatchObject({
      walletId: "w-dee",
      contractAddress: ARC_USDC_ADDRESS,
      abiFunctionSignature: "approve(address,uint256)",
      abiParameters: [treasury, "240000"],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });
    expect(calls[1]?.[0]).toMatchObject({
      walletId: "w-dee",
      contractAddress: treasury,
      abiFunctionSignature: "deposit(uint256)",
      abiParameters: ["240000"],
    });
  });

  it("approve_loan → treasurer approveLoan with MEDIUM fee", async () => {
    const client = mockClient();
    const result = await executeProposedAction(
      {
        tick: 3,
        agent: "ada",
        action: { kind: "approve_loan", loanId: "2", amountUsdc: "1200000" },
      },
      deps(client),
    );
    expect(result.status).toBe("complete");
    expect(client.createContractExecutionTransaction).toHaveBeenCalledWith({
      walletId: "w-ada",
      contractAddress: treasury,
      abiFunctionSignature: "approveLoan(uint256)",
      abiParameters: ["2"],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      idempotencyKey: "test-idem-key",
    });
  });

  it("idle → skipped without client calls", async () => {
    const client = mockClient();
    const result = await executeProposedAction(
      { tick: 1, agent: "gus", action: { kind: "idle" } },
      deps(client),
    );
    expect(result).toEqual({ status: "skipped" });
    expect(client.createTransaction).not.toHaveBeenCalled();
    expect(client.createContractExecutionTransaction).not.toHaveBeenCalled();
  });

  it("CircleTxFailed → failed status, error not swallowed", async () => {
    const client = mockClient({
      getTransaction: vi.fn(async () => ({
        data: {
          transaction: tx("FAILED", {
            errorReason: "EXECUTION_REVERTED",
            errorDetails: "InsufficientLiquidity",
          }),
        },
      })),
    });
    const result = await executeProposedAction(
      {
        tick: 4,
        agent: "ada",
        action: { kind: "approve_loan", loanId: "1", amountUsdc: "3000000" },
      },
      deps(client),
    );
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.error).toMatch(/FAILED/);
      expect(result.error).toMatch(/InsufficientLiquidity/);
    }
  });

  it("post_job decodes jobId then fund_escrow funds that id", async () => {
    const client = mockClient();
    const jobIdFromTxHash = vi.fn(async () => "42");
    const post = await executeProposedAction(
      { tick: 1, agent: "bo", action: { kind: "post_job", amountUsdc: "1200000" } },
      { ...deps(client), jobIdFromTxHash },
    );
    expect(post).toMatchObject({ status: "complete", jobId: "42" });
    expect(jobIdFromTxHash).toHaveBeenCalledWith("0xabc");

    const fund = await executeProposedAction(
      {
        tick: 1,
        agent: "bo",
        action: { kind: "fund_escrow", amountUsdc: "1200000", jobId: "42" },
      },
      deps(client),
    );
    expect(fund.status).toBe("complete");
    const calls = vi.mocked(client.createContractExecutionTransaction).mock.calls;
    const setBudget = calls.find(
      (c) => c[0]?.abiFunctionSignature === "setBudget(uint256,uint256,bytes)",
    );
    expect(setBudget?.[0]?.abiParameters?.[0]).toBe("42");
    const fundCall = calls.find((c) => c[0]?.abiFunctionSignature === "fund(uint256,bytes)");
    expect(fundCall?.[0]?.abiParameters?.[0]).toBe("42");
  });

  it("fixture loanId L-1 / L-2 → skipped, zero Circle calls", async () => {
    const client = mockClient();
    const kinds = ["approve_loan", "deny_loan", "repay", "mark_default"] as const;
    for (const kind of kinds) {
      const result = await executeProposedAction(
        {
          tick: 1,
          agent: "ada",
          action: { kind, loanId: kind === "repay" ? "L-1" : "L-2", amountUsdc: "1200000" },
        },
        deps(client),
      );
      expect(result).toEqual({ status: "skipped" });
    }
    expect(client.createContractExecutionTransaction).not.toHaveBeenCalled();
    expect(client.createTransaction).not.toHaveBeenCalled();
  });

  it("request_loan skipped when borrower already has an activeLoanOf slot", async () => {
    const client = mockClient();
    const result = await executeProposedAction(
      { tick: 2, agent: "bo", action: { kind: "request_loan", amountUsdc: "1200000" } },
      { ...deps(client), activeLoanOf: async () => 7n },
    );
    expect(result).toEqual({ status: "skipped" });
    expect(client.createContractExecutionTransaction).not.toHaveBeenCalled();
  });

  it("approve_loan skipped when on-chain status is not Pending", async () => {
    const client = mockClient();
    const result = await executeProposedAction(
      { tick: 2, agent: "ada", action: { kind: "approve_loan", loanId: "5", amountUsdc: "1200000" } },
      { ...deps(client), loanStatus: async () => 4 },
    );
    expect(result).toEqual({ status: "skipped" });
    expect(client.createContractExecutionTransaction).not.toHaveBeenCalled();
  });

  it("fixture jobId J-demo → skipped, zero Circle calls", async () => {
    const client = mockClient();
    const kinds = ["accept_job", "deliver", "complete_job", "fund_escrow"] as const;
    for (const kind of kinds) {
      const result = await executeProposedAction(
        {
          tick: 1,
          agent: "dee",
          action: { kind, jobId: "J-demo", amountUsdc: "1200000" },
        },
        deps(client),
      );
      expect(result).toEqual({ status: "skipped" });
    }
    expect(client.createContractExecutionTransaction).not.toHaveBeenCalled();
    expect(client.createTransaction).not.toHaveBeenCalled();
  });

  it("numeric jobId still executes (mocked client)", async () => {
    const client = mockClient();
    const result = await executeProposedAction(
      { tick: 1, agent: "dee", action: { kind: "accept_job", jobId: "185764" } },
      deps(client),
    );
    expect(result).toEqual({ status: "complete", txHash: "0xabc", txId: "tx-exec" });
    expect(client.createContractExecutionTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: "w-dee",
        contractAddress: jobs,
        abiParameters: ["185764", testRoster.wallets.find((w) => w.name === "dee")!.address],
      }),
    );
  });

  it("fund_escrow without jobId → skipped (no throw)", async () => {
    const client = mockClient();
    const result = await executeProposedAction(
      { tick: 1, agent: "bo", action: { kind: "fund_escrow", amountUsdc: "1200000" } },
      deps(client),
    );
    expect(result).toEqual({ status: "skipped" });
    expect(client.createContractExecutionTransaction).not.toHaveBeenCalled();
  });

  it("timeout → pending with txId", async () => {
    const client = mockClient();
    const waitComplete = vi.fn(async (_c, txId: string) => {
      throw new CircleTxTimeout(txId, 120_000, "QUEUED");
    });
    const result = await executeProposedAction(
      {
        tick: 1,
        agent: "gus",
        action: { kind: "buy", amountUsdc: "100000", to: "bo" },
      },
      { ...deps(client), waitComplete },
    );
    expect(result).toEqual({
      status: "pending",
      txId: "tx-xfer",
      error: expect.stringMatching(/120000ms/),
    });
  });
});

describe("resolveExecuteEnabled", () => {
  it("defaults off without ALLOW_BROADCAST", () => {
    expect(resolveExecuteEnabled({}, { once: false, yes: false })).toBe(false);
    expect(resolveExecuteEnabled({ ALLOW_BROADCAST: "true" }, { once: false, yes: false })).toBe(
      false,
    );
    expect(
      resolveExecuteEnabled({ ALLOW_BROADCAST: "true", SIM_EXECUTE: "on" }, { once: false, yes: false }),
    ).toBe(true);
    expect(resolveExecuteEnabled({ ALLOW_BROADCAST: "true" }, { once: false, yes: true })).toBe(
      true,
    );
  });

  it("parseSimConfig leaves executeEnabled false by default", () => {
    expect(parseSimConfig({}).executeEnabled).toBe(false);
  });
});

describe("engine + executeAction", () => {
  it("dry-run / missing executeEnabled → skipped, zero client calls", async () => {
    const client = mockClient();
    const executeAction = createExecuteAction(deps(client));
    const ledger = new MemoryLedger();
    const config = parseSimConfig({});
    await runSingleTick(ledger, config, { executeAction });
    const actions = await ledger.listActions();
    expect(actions.every((a) => a.status === "skipped")).toBe(true);
    expect(client.createTransaction).not.toHaveBeenCalled();
    expect(client.createContractExecutionTransaction).not.toHaveBeenCalled();
  });

  it("executeEnabled + executeAction → complete with tx hash", async () => {
    const client = mockClient();
    const executeAction = createExecuteAction(deps(client));
    const ledger = new MemoryLedger();
    const config = parseSimConfig(
      { ALLOW_BROADCAST: "true", SIM_EXECUTE: "on" },
      { once: false, yes: false },
    );
    await runSingleTick(
      ledger,
      config,
      {
        executeAction,
        getWorld: async (tick) =>
          loadWorld(tick, {
            merchantPriceUsdc: "500000",
            balances: { gus: "2000000" },
            inventory: { bo: 3 },
          }),
      },
    );
    const buy = (await ledger.listActions()).find((a) => a.kind === "buy");
    expect(buy?.status).toBe("complete");
    expect(buy?.tx).toBe("0xabc");
    expect(client.createTransaction).toHaveBeenCalled();
  });

  it("failure → ledger status failed", async () => {
    const executeAction = vi.fn(async () => ({
      status: "failed" as const,
      error: "mock denied",
    }));
    const ledger = new MemoryLedger();
    const config = parseSimConfig(
      { ALLOW_BROADCAST: "true", SIM_EXECUTE: "on" },
      { once: false, yes: false },
    );
    await runSingleTick(ledger, config, {
      executeAction,
      getWorld: async (tick) =>
        loadWorld(tick, {
          loans: [
            {
              id: "1",
              borrower: "bo",
              principalUsdc: "1000000",
              status: "pending",
              approvedAtTick: null,
            },
          ],
          creditScores: { bo: 80 },
          treasury: {
            utilisationBps: 0,
            outstandingUsdc: "0",
            baseRateBps: 300,
            defaults: 0,
          },
        }),
    });
    const approve = (await ledger.listActions()).find((a) => a.kind === "approve_loan");
    expect(approve?.status).toBe("failed");
  });

  it("threads post_job jobId into same-tick fund_escrow", async () => {
    const client = mockClient();
    const ledger = new MemoryLedger();
    const config = parseSimConfig(
      { ALLOW_BROADCAST: "true", SIM_EXECUTE: "on", STORYLINE: "free" },
      { once: false, yes: false },
    );
    await runSingleTick(ledger, config, {
      executeAction: createExecuteAction({
        ...deps(client),
        jobIdFromTxHash: async () => "7",
      }),
      getWorld: async (tick) =>
        loadWorld(tick, {
          restockCostUsdc: "1000000",
          inventory: { bo: 1 },
          balances: { bo: "2000000" },
        }),
    });
    const actions = await ledger.listActions();
    expect(actions.find((a) => a.kind === "post_job")?.status).toBe("complete");
    expect(actions.find((a) => a.kind === "fund_escrow")?.status).toBe("complete");
    const calls = vi.mocked(client.createContractExecutionTransaction).mock.calls;
    expect(calls.some((c) => c[0]?.abiParameters?.[0] === "7")).toBe(true);
  });
});
