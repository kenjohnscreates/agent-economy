// M2.3 encoding: Arc coinType, DNS wire names, roster → TownRegistrar.Role.
// Vectors: DnsCodec.encodeTownName / ENSIP-11 / shared ROSTER. No tokenIds (R3).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AGENT_NAMES, ENS_ARC_COIN_TYPE, ENS_KEYS, ROSTER } from "@agent-town/shared";
import { createPublicClient, http, namehash, zeroAddress } from "viem";
import { sepolia } from "viem/chains";
import { describe, expect, it } from "vitest";
import { addresses } from "./deployments.js";
import {
  COIN_TYPE_ARC,
  COIN_TYPE_ETH,
  DEFAULT_APP_ORIGIN,
  REGISTER_SELECTOR,
  REGISTRY_REGISTRAR_ROLES,
  RESOLVER_REGISTRAR_ROLES,
  SET_ADDR_NAMECHAIN_SELECTOR,
  SET_ADDRESS_SELECTOR,
  agentContextMarkdown,
  avatarUrl,
  buildMintPlan,
  dnsEncodeName,
  dnsEncodeTownName,
  encodeEvmAddressBytes,
  encodeRegister,
  encodeSetAddress,
  registrarRoleOf,
  rosterRoleOf,
} from "./records.js";

const ADA = "0x97847b3c015994784ae8cf776ef9a4d563618cf2" as const;
const TOWN = "botanica";
const REGISTRY = "0xC4f5B3aa81390932398d23D736A965cA35de40f9" as const;
const RESOLVER = "0x800d27e6e8497a57C273C53c86F2ec0713CEefc8" as const;
const REGISTRAR = "0x0000000000000000000000000000000000001111" as const;

// abi.encodePacked(uint8(3), "ada", uint8(8), "botanica", uint8(3), "eth", 0x00)
const ADA_DNS = "0x0361646108626f74616e6963610365746800" as const;

const ROLE_ENUM = { treasurer: 0, merchant: 1, worker: 2, consumer: 3 } as const;

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

describe("coinType (ENSIP-11 Arc)", () => {
  it("2152525650 === 0x80000000 | 5042002", () => {
    expect(COIN_TYPE_ARC).toBe(2152525650n);
    expect(COIN_TYPE_ARC).toBe(BigInt(ENS_ARC_COIN_TYPE));
    expect(Number(COIN_TYPE_ARC)).toBe(0x80000000 + 5042002);
    expect(COIN_TYPE_ETH).toBe(60n);
  });
});

describe("DNS wire encoding (DnsCodec / packetToBytes)", () => {
  it("ada.botanica.eth matches encodePacked length-prefixed labels", () => {
    expect(dnsEncodeTownName("ada", TOWN)).toBe(ADA_DNS);
    expect(dnsEncodeName("ada.botanica.eth")).toBe(ADA_DNS);
  });

  it("encodes every roster name as {label}.botanica.eth", () => {
    for (const r of ROSTER) {
      const dns = dnsEncodeTownName(r.name, TOWN);
      expect(dns.startsWith("0x")).toBe(true);
      expect(dns.endsWith("0365746800")).toBe(true); // eth\0
      expect(Buffer.from(r.name).length).toBeLessThan(256);
    }
  });
});

describe("roster → TownRegistrar.Role", () => {
  it("maps ada treasurer, bo/cy merchant, dee/eli/fay worker, gus/hal consumer", () => {
    expect(rosterRoleOf("ada")).toBe("treasurer");
    expect(rosterRoleOf("bo")).toBe("merchant");
    expect(rosterRoleOf("cy")).toBe("merchant");
    expect(rosterRoleOf("dee")).toBe("worker");
    expect(rosterRoleOf("eli")).toBe("worker");
    expect(rosterRoleOf("fay")).toBe("worker");
    expect(rosterRoleOf("gus")).toBe("consumer");
    expect(rosterRoleOf("hal")).toBe("consumer");
    for (const r of ROSTER) {
      expect(registrarRoleOf(r.role)).toBe(ROLE_ENUM[r.role]);
    }
  });
});

describe("record calldata", () => {
  it("setAddress uses inode selector, not namechain setAddr(bytes32,…)", () => {
    const data = encodeSetAddress(ADA_DNS, COIN_TYPE_ARC, ADA);
    expect(data.slice(0, 10)).toBe(SET_ADDRESS_SELECTOR);
    expect(SET_ADDRESS_SELECTOR).not.toBe(SET_ADDR_NAMECHAIN_SELECTOR);
    expect(data.toLowerCase()).toContain(COIN_TYPE_ARC.toString(16));
    expect(data.toLowerCase()).toContain(ADA.slice(2).toLowerCase());
  });

  it("setAddress(coinType 60) packs the same 20-byte wallet", () => {
    const data = encodeSetAddress(ADA_DNS, COIN_TYPE_ETH, ADA);
    expect(data.slice(0, 10)).toBe(SET_ADDRESS_SELECTOR);
    expect(data.toLowerCase()).toContain("000000000000000000000000000000000000003c"); // 60
    expect(encodeEvmAddressBytes(ADA)).toBe(ADA);
  });

  it("register(label, owner, Role) selector is uint8 role, not a tokenId", () => {
    const data = encodeRegister("ada", ADA, 0);
    expect(data.slice(0, 10)).toBe(REGISTER_SELECTOR);
    expect(data.toLowerCase()).not.toMatch(/tokenid/i);
  });
});

describe("buildMintPlan", () => {
  const wallets = walletsFromRosterJson();
  const plan = buildMintPlan({
    townLabel: TOWN,
    registry: REGISTRY,
    resolver: RESOLVER,
    registrar: REGISTRAR,
    wallets,
  });

  it("covers ada|bo|cy|dee|eli|fay|gus|hal and never a tokenId", () => {
    expect(plan.agents.map((a) => a.name)).toEqual([...AGENT_NAMES]);
    expect(JSON.stringify(plan)).not.toMatch(/tokenId/i);
    expect(plan.grants.registry.toLowerCase()).toContain(REGISTRY_REGISTRAR_ROLES.toString(16));
    expect(plan.grants.resolver.toLowerCase()).toContain(
      (RESOLVER_REGISTRAR_ROLES & ((1n << 128n) - 1n)).toString(16),
    );
  });

  it("ada addr records + ENSIP-26 context + town.role + avatar", () => {
    const ada = plan.agents[0];
    expect(ada?.ensName).toBe("ada.botanica.eth");
    expect(ada?.role).toBe("treasurer");
    expect(ada?.registrarRole).toBe(0);
    expect(ada?.wallet.toLowerCase()).toBe(wallets.ada!.toLowerCase());
    expect(ada?.owner.toLowerCase()).toBe(wallets.ada!.toLowerCase());
    expect(ada?.dnsName).toBe(ADA_DNS);
    expect(ada?.node).toBe(namehash("ada.botanica.eth"));
    expect(ada?.avatar).toBe(`${DEFAULT_APP_ORIGIN}/sprites/ada.png`);
    expect(ada?.agentContext).toContain("role: treasurer");
    expect(ada?.agentContext).toContain("town: botanica");
    expect(ada?.agentContext).toContain("/agents/ada");
    expect(ada?.agentContext).toContain(REGISTRY);
    expect(ada?.calls.setTownRole.toLowerCase()).toContain(
      Buffer.from(ENS_KEYS.role).toString("hex"),
    );
    expect(ada?.calls.resolveAddrArc.toLowerCase()).toContain(COIN_TYPE_ARC.toString(16));
  });

  it("does not encode town.credit-score", () => {
    expect(JSON.stringify(plan)).not.toContain("town.credit-score");
  });

  it("avatar expands roster /sprites/<name>.png to a placeholder URL", () => {
    expect(avatarUrl("hal", "https://example.invalid")).toBe(
      "https://example.invalid/sprites/hal.png",
    );
    expect(
      agentContextMarkdown({
        name: "bo",
        town: TOWN,
        role: "merchant",
        wallet: ADA,
        registry: REGISTRY,
        resolver: RESOLVER,
      }),
    ).toContain("role: merchant");
  });
});

describe("hackathon bytecode selectors (network)", () => {
  it("PermissionedResolverImpl contains setAddress, not required setAddr", async (ctx) => {
    const client = createPublicClient({
      chain: sepolia,
      transport: http(
        process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
        { timeout: 8_000, retryCount: 0 },
      ),
    });
    let code: `0x${string}` | undefined;
    try {
      code = await client.getCode({ address: addresses.PermissionedResolverImpl });
    } catch {
      ctx.skip();
      return;
    }
    if (!code) {
      ctx.skip();
      return;
    }
    expect(code).toContain(SET_ADDRESS_SELECTOR.slice(2));
    expect(zeroAddress).not.toBe(addresses.UpgradableUniversalResolverProxy);
  }, 15_000);
});
