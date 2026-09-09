import { describe, expect, it, vi } from "vitest";
import { ARC_TESTNET_BLOCKCHAIN, type CircleClient, type CircleTx } from "./client.js";
import {
  ARC_MIN_MAX_FEE_GWEI,
  CircleTxFailed,
  CircleTxTimeout,
  absoluteFee,
  executeContract,
  getTxHash,
  transferUsdc,
  waitComplete,
} from "./execute.js";

const tx = (state: string, extra: Partial<CircleTx> = {}): CircleTx => ({
  id: "tx-1",
  state,
  ...extra,
});

/** getTransaction mock that walks a scripted sequence of states. */
function stateSequence(states: Array<CircleTx | undefined>): CircleClient["getTransaction"] {
  let i = 0;
  return vi.fn(async () => {
    const t = states[Math.min(i, states.length - 1)];
    i++;
    return { data: t ? { transaction: t } : undefined };
  });
}

function client(over: Partial<CircleClient>): CircleClient {
  return {
    createWalletSet: vi.fn(),
    getWalletSet: vi.fn(),
    createWallets: vi.fn(),
    listWallets: vi.fn(),
    createContractExecutionTransaction: vi.fn(async () => ({
      data: { id: "tx-exec", state: "INITIATED" },
    })),
    createTransaction: vi.fn(async () => ({ data: { id: "tx-xfer", state: "INITIATED" } })),
    getTransaction: vi.fn(),
    getWalletTokenBalance: vi.fn(),
    ...over,
  };
}

const noSleep = async () => {};

describe("waitComplete state machine", () => {
  it("INITIATED → CLEARED → QUEUED → SENT → CONFIRMED → COMPLETE resolves with the tx", async () => {
    const c = client({
      getTransaction: stateSequence([
        tx("INITIATED"),
        tx("CLEARED"),
        tx("QUEUED"),
        tx("SENT"),
        tx("CONFIRMED", { txHash: "0xabc" }),
        tx("COMPLETE", { txHash: "0xabc" }),
      ]),
    });
    const sleep = vi.fn(noSleep);
    const r = await waitComplete(c, "tx-1", { sleep, pollMs: 5, timeoutMs: 10_000 });
    expect(r.state).toBe("COMPLETE");
    expect(r.txHash).toBe("0xabc");
    expect(c.getTransaction).toHaveBeenCalledTimes(6);
    expect(sleep).toHaveBeenCalledTimes(5);
    expect(sleep).toHaveBeenCalledWith(5);
  });

  it("FAILED throws CircleTxFailed carrying state + reason + details", async () => {
    const c = client({
      getTransaction: stateSequence([
        tx("SENT"),
        tx("FAILED", { errorReason: "EXECUTION_REVERTED", errorDetails: "insufficient funds" }),
      ]),
    });
    const err = await waitComplete(c, "tx-1", { sleep: noSleep }).catch((e) => e);
    expect(err).toBeInstanceOf(CircleTxFailed);
    expect(err.state).toBe("FAILED");
    expect(err.reason).toBe("EXECUTION_REVERTED");
    expect(err.message).toMatch(/tx-1 FAILED: EXECUTION_REVERTED \(insufficient funds\)/);
  });

  it.each(["DENIED", "CANCELLED", "STUCK"])("%s is terminal failure", async (s) => {
    const c = client({ getTransaction: stateSequence([tx(s)]) });
    await expect(waitComplete(c, "tx-1", { sleep: noSleep })).rejects.toBeInstanceOf(
      CircleTxFailed,
    );
  });

  it("times out with CircleTxTimeout when never terminal (empty body tolerated)", async () => {
    let t = 0;
    const c = client({ getTransaction: stateSequence([undefined, tx("QUEUED")]) });
    const err = await waitComplete(c, "tx-1", {
      sleep: async () => {
        t += 1000;
      },
      now: () => t,
      timeoutMs: 3000,
      pollMs: 1000,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(CircleTxTimeout);
    expect(err.lastState).toBe("QUEUED");
    expect(err.message).toMatch(/3000ms/);
    expect(c.getTransaction).toHaveBeenCalledTimes(4);
  });
});

describe("submit helpers", () => {
  it("executeContract passes walletId/contract/sig/params with MEDIUM fee default", async () => {
    const c = client({});
    const r = await executeContract(c, {
      walletId: "w-ada",
      contractAddress: "0x0747EEf0706327138c69792bF28Cd525089e4583",
      abiFunctionSignature: "requestLoan(uint256)",
      abiParameters: ["3000000"],
    });
    expect(r).toEqual({ txId: "tx-exec", state: "INITIATED" });
    expect(c.createContractExecutionTransaction).toHaveBeenCalledWith({
      walletId: "w-ada",
      contractAddress: "0x0747EEf0706327138c69792bF28Cd525089e4583",
      abiFunctionSignature: "requestLoan(uint256)",
      abiParameters: ["3000000"],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });
  });

  it("transferUsdc converts 6-dec base units to a decimal amount and targets the USDC ERC-20", async () => {
    const c = client({});
    const r = await transferUsdc(c, {
      walletId: "w-mayor",
      to: "0x" + "2".repeat(40),
      amountUsdc: "3500000",
    });
    expect(r.txId).toBe("tx-xfer");
    // 6-dec ERC-20 (0x3600…), not native 18-dec. Circle needs blockchain with tokenAddress.
    expect(c.createTransaction).toHaveBeenCalledWith({
      walletId: "w-mayor",
      tokenAddress: "0x3600000000000000000000000000000000000000",
      blockchain: ARC_TESTNET_BLOCKCHAIN,
      destinationAddress: "0x" + "2".repeat(40),
      amount: ["3.5"],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });
  });

  it("transferUsdc rejects decimal input (must be base units)", async () => {
    const c = client({});
    await expect(
      transferUsdc(c, { walletId: "w", to: "0x" + "2".repeat(40), amountUsdc: "3.5" }),
    ).rejects.toThrow(/base-unit/);
    expect(c.createTransaction).not.toHaveBeenCalled();
  });

  it("throws when the API returns no id", async () => {
    const c = client({
      createContractExecutionTransaction: vi.fn(async () => ({ data: undefined })),
    });
    await expect(
      executeContract(c, {
        walletId: "w",
        contractAddress: "0x",
        abiFunctionSignature: "f()",
        abiParameters: [],
      }),
    ).rejects.toThrow(/no tx id/);
  });

  it("getTxHash returns undefined until populated", async () => {
    const c = client({
      getTransaction: stateSequence([tx("SENT"), tx("CONFIRMED", { txHash: "0xdead" })]),
    });
    expect(await getTxHash(c, "tx-1")).toBeUndefined();
    expect(await getTxHash(c, "tx-1")).toBe("0xdead");
  });

  it("absoluteFee clamps maxFee to the Arc 20 gwei floor", () => {
    expect(ARC_MIN_MAX_FEE_GWEI).toBe(20n);
    expect(absoluteFee({ gasLimit: 100_000n, maxFeeGwei: "5" })).toEqual({
      type: "absolute",
      config: { gasLimit: "100000", maxFee: "20", priorityFee: "1" },
    });
    expect(absoluteFee({ gasLimit: "21000", maxFeeGwei: 40n, priorityFeeGwei: 0n }).config).toEqual(
      {
        gasLimit: "21000",
        maxFee: "40",
        priorityFee: "0",
      },
    );
  });
});
