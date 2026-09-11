import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EMPTY_ROSTER,
  WALLET_NAMES,
  WalletRosterSchema,
  readRoster,
  rosterOwnerOfAddress,
  walletFor,
  writeRoster,
} from "./roster.js";

const ADDR = "0x1111111111111111111111111111111111111111";

describe("roster schema", () => {
  it("has 9 wallet names: 8 agents + mayor", () => {
    expect(WALLET_NAMES).toHaveLength(9);
    expect(WALLET_NAMES).toContain("mayor");
    expect(WALLET_NAMES).toContain("ada");
  });

  it("accepts a valid roster", () => {
    const r = WalletRosterSchema.parse({
      ...EMPTY_ROSTER,
      walletSetId: "ws-1",
      wallets: [{ name: "ada", walletId: "w-1", address: ADDR }],
    });
    expect(r.wallets[0]?.name).toBe("ada");
  });

  it("rejects unknown names, bad addresses, wrong chain and duplicates", () => {
    expect(() =>
      WalletRosterSchema.parse({
        ...EMPTY_ROSTER,
        wallets: [{ name: "zed", walletId: "w", address: ADDR }],
      }),
    ).toThrow();
    expect(() =>
      WalletRosterSchema.parse({
        ...EMPTY_ROSTER,
        wallets: [{ name: "ada", walletId: "w", address: "0x123" }],
      }),
    ).toThrow();
    expect(() =>
      WalletRosterSchema.parse({ ...EMPTY_ROSTER, blockchain: "ETH-SEPOLIA" }),
    ).toThrow();
    expect(() =>
      WalletRosterSchema.parse({
        ...EMPTY_ROSTER,
        wallets: [
          { name: "ada", walletId: "w1", address: ADDR },
          { name: "ada", walletId: "w2", address: ADDR },
        ],
      }),
    ).toThrow(/duplicate/);
  });
});

describe("roster file io", () => {
  const dir = mkdtempSync(join(tmpdir(), "circle-roster-"));

  it("missing file → empty roster", () => {
    expect(readRoster(join(dir, "nope.json"))).toEqual(EMPTY_ROSTER);
  });

  it("write then read round-trips and is pretty-printed", () => {
    const p = join(dir, "roster.json");
    writeRoster(
      {
        ...EMPTY_ROSTER,
        walletSetId: "ws",
        wallets: [{ name: "mayor", walletId: "m", address: ADDR }],
      },
      p,
    );
    expect(readFileSync(p, "utf8").endsWith("}\n")).toBe(true);
    const r = readRoster(p);
    expect(walletFor(r, "mayor").walletId).toBe("m");
    expect(() => walletFor(r, "ada")).toThrow(/setup-wallets/);
  });

  it("corrupt file throws", () => {
    const p = join(dir, "bad.json");
    writeFileSync(p, JSON.stringify({ wallets: "nope" }));
    expect(() => readRoster(p)).toThrow();
  });
});

describe("rosterOwnerOfAddress", () => {
  it("matches case-insensitively and misses unknown 0x", () => {
    const r = WalletRosterSchema.parse({
      ...EMPTY_ROSTER,
      walletSetId: "ws",
      wallets: [{ name: "ada", walletId: "w-ada", address: ADDR }],
    });
    expect(rosterOwnerOfAddress(r, ADDR.toUpperCase())?.name).toBe("ada");
    expect(rosterOwnerOfAddress(r, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")).toBeUndefined();
  });
});
