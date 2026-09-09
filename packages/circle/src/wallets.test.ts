import { describe, expect, it, vi } from "vitest";
import type { CircleClient } from "./client.js";
import { EMPTY_ROSTER, WALLET_NAMES, type WalletRoster } from "./roster.js";
import { ensureRosterWallets, ensureWalletSet } from "./wallets.js";

const addr = (i: number) => `0x${i.toString(16).padStart(40, "0")}`;

function mockClient(over: Partial<CircleClient> = {}): CircleClient {
  return {
    createWalletSet: vi.fn(async () => ({ data: { walletSet: { id: "ws-new" } } })),
    getWalletSet: vi.fn(async ({ id }) => ({ data: { walletSet: { id } } })),
    createWallets: vi.fn(async (input) => ({
      data: {
        wallets: (input.metadata ?? []).map((m, i) => ({
          id: `w-${m.refId}`,
          address: addr(100 + i),
          blockchain: "ARC-TESTNET",
          refId: m.refId,
          name: m.name,
        })),
      },
    })),
    listWallets: vi.fn(async () => ({ data: { wallets: [] } })),
    createContractExecutionTransaction: vi.fn(),
    createTransaction: vi.fn(),
    getTransaction: vi.fn(),
    getWalletTokenBalance: vi.fn(),
    ...over,
  };
}

const fullRoster = (): WalletRoster => ({
  ...EMPTY_ROSTER,
  walletSetId: "ws-1",
  wallets: WALLET_NAMES.map((name, i) => ({ name, walletId: `w-${name}`, address: addr(i + 1) })),
});

describe("ensureWalletSet", () => {
  it("verifies via getWalletSet when env id set; no create", async () => {
    const c = mockClient();
    const r = await ensureWalletSet(c, "agent-town", { walletSetId: "ws-env" });
    expect(r).toEqual({ walletSetId: "ws-env", created: false });
    expect(c.getWalletSet).toHaveBeenCalledWith({ id: "ws-env" });
    expect(c.createWalletSet).not.toHaveBeenCalled();
  });

  it("falls back to roster id with a warning", async () => {
    const c = mockClient();
    const warn = vi.fn();
    const r = await ensureWalletSet(c, "agent-town", {
      rosterWalletSetId: "ws-roster",
      log: { info: vi.fn(), warn },
    });
    expect(r.walletSetId).toBe("ws-roster");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("CIRCLE_WALLET_SET_ID unset"));
  });

  it("creates when nothing known and logs the id", async () => {
    const c = mockClient();
    const info = vi.fn();
    const r = await ensureWalletSet(c, "agent-town", { log: { info, warn: vi.fn() } });
    expect(r).toEqual({ walletSetId: "ws-new", created: true });
    expect(c.createWalletSet).toHaveBeenCalledWith({ name: "agent-town" });
    expect(info).toHaveBeenCalledWith(expect.stringContaining("CIRCLE_WALLET_SET_ID=ws-new"));
  });

  it("throws when the known id does not resolve", async () => {
    const c = mockClient({ getWalletSet: vi.fn(async () => ({ data: undefined })) });
    await expect(ensureWalletSet(c, "x", { walletSetId: "ghost" })).rejects.toThrow(/not found/);
  });
});

describe("ensureRosterWallets", () => {
  it("existing full roster → zero API calls", async () => {
    const c = mockClient();
    const r = await ensureRosterWallets(c, "ws-1", fullRoster());
    expect(r.wallets).toHaveLength(9);
    expect(r.created).toEqual([]);
    expect(r.recovered).toEqual([]);
    expect(c.listWallets).not.toHaveBeenCalled();
    expect(c.createWallets).not.toHaveBeenCalled();
  });

  it("empty roster → one createWallets call with 9 SCA wallets on ARC-TESTNET + refIds", async () => {
    const c = mockClient();
    const r = await ensureRosterWallets(c, "ws-1", structuredClone(EMPTY_ROSTER));
    expect(c.listWallets).toHaveBeenCalledTimes(9);
    expect(c.createWallets).toHaveBeenCalledTimes(1);
    expect(c.createWallets).toHaveBeenCalledWith({
      walletSetId: "ws-1",
      accountType: "SCA",
      blockchains: ["ARC-TESTNET"],
      count: 9,
      metadata: WALLET_NAMES.map((name) => ({ name, refId: name })),
    });
    expect(r.created).toEqual([...WALLET_NAMES]);
    expect(r.wallets.map((w) => w.name)).toEqual([...WALLET_NAMES]);
    expect(r.wallets.find((w) => w.name === "mayor")?.walletId).toBe("w-mayor");
  });

  it("partial roster → recovers by refId, creates only the rest", async () => {
    const roster = fullRoster();
    roster.wallets = roster.wallets.filter((w) => !["gus", "hal", "mayor"].includes(w.name));
    const c = mockClient({
      listWallets: vi.fn(async ({ refId } = {}) => ({
        data: {
          wallets:
            refId === "gus"
              ? [{ id: "w-gus-old", address: addr(77), blockchain: "ARC-TESTNET", refId: "gus" }]
              : [],
        },
      })),
    });
    const r = await ensureRosterWallets(c, "ws-1", roster);
    expect(r.recovered).toEqual(["gus"]);
    expect(r.created).toEqual(["hal", "mayor"]);
    expect(c.createWallets).toHaveBeenCalledWith(expect.objectContaining({ count: 2 }));
    expect(r.wallets.find((w) => w.name === "gus")?.walletId).toBe("w-gus-old");
    expect(r.wallets).toHaveLength(9);
  });

  it("throws if createWallets returns the wrong count (no partial roster)", async () => {
    const c = mockClient({ createWallets: vi.fn(async () => ({ data: { wallets: [] } })) });
    await expect(ensureRosterWallets(c, "ws-1", structuredClone(EMPTY_ROSTER))).rejects.toThrow(
      /expected 9/,
    );
  });
});
