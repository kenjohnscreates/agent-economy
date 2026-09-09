// M2.1 encoding: VerifiableFactory salts + initialize calldata + ETHRegistry
// pointer calldata by labelhash (never tokenId). Vectors from `cast keccak` /
// `cast abi-encode` against the documented salt scheme.
import { createPublicClient, http, toFunctionSelector, zeroAddress } from "viem";
import { sepolia } from "viem/chains";
import { describe, expect, it } from "vitest";
import { ethRegistryAbi } from "./abi/ethRegistry.js";
import { addresses } from "./deployments.js";
import {
  ALL_ROLES,
  encodeDeployProxy,
  encodeRegistryInit,
  encodeResolverInit,
  encodeSetResolver,
  encodeSetSubregistry,
  labelhashOf,
  registrySalt,
  resolverSalt,
  townDeployRecord,
} from "./factory.js";

const TREASURER = "0xD428294070595052d9E0607f28CDf51b52156d2A" as const;
const LABEL = "botanica";

// cast keccak botanica
const LABELHASH = 0xe9a2b5b2c3953454f0746857ffa658ee9fc99a3d8e40670a9a66b42f0e55fc30n;
// cast keccak of abi.encode(keccak256("OwnedResolver"), treasurer, 0)
const RESOLVER_SALT = 0xeb920846fadcb5fe0bc6898a04ffb1501ad0b9fc47276e66ae7c3148abbc7fc3n;
// cast keccak of abi.encode(keccak256("UserRegistry"), namehash("botanica.eth"), 0)
const REGISTRY_SALT = 0x16b4550f21394457984e531e5c386878d21e6eb6a9eee4bc8c1fd7585452627cn;

describe("factory salts (ENS VerifiableFactory scheme)", () => {
  it("labelhashOf(botanica) matches keccak256(utf8) — used as anyId, not a tokenId", () => {
    expect(labelhashOf(LABEL)).toBe(LABELHASH);
  });

  it("resolverSalt(treasurer, 0) matches keccak256(OwnedResolver, owner, version)", () => {
    expect(resolverSalt(TREASURER)).toBe(RESOLVER_SALT);
  });

  it("registrySalt(botanica.eth, 0) matches keccak256(UserRegistry, namehash, version)", () => {
    expect(registrySalt(`${LABEL}.eth`)).toBe(REGISTRY_SALT);
  });

  it("changing owner or name changes salt", () => {
    expect(resolverSalt("0x0000000000000000000000000000000000000001")).not.toBe(RESOLVER_SALT);
    expect(registrySalt("other.eth")).not.toBe(REGISTRY_SALT);
  });
});

describe("initialize / deployProxy calldata (hackathon bytecode selectors)", () => {
  it("UserRegistry initialize selector is grants[] (0x37cb53a8), not (address,uint256)", () => {
    const data = encodeRegistryInit(TREASURER);
    expect(data.slice(0, 10)).toBe("0x37cb53a8");
    expect(data.slice(0, 10)).not.toBe(toFunctionSelector("function initialize(address,uint256)"));
  });

  it("PermissionedResolver initialize selector is grants[]+calls[] (0x33cc44a0)", () => {
    expect(encodeResolverInit(TREASURER).slice(0, 10)).toBe("0x33cc44a0");
  });

  it("deployProxy calldata targets UserRegistryImpl / PermissionedResolverImpl from deployments.json", () => {
    const registryData = encodeDeployProxy(
      addresses.UserRegistryImpl,
      registrySalt(`${LABEL}.eth`),
      encodeRegistryInit(TREASURER),
    );
    const resolverData = encodeDeployProxy(
      addresses.PermissionedResolverImpl,
      resolverSalt(TREASURER),
      encodeResolverInit(TREASURER),
    );
    expect(registryData.slice(0, 10)).toBe("0x5d84121a");
    expect(registryData.toLowerCase()).toContain(addresses.UserRegistryImpl.slice(2).toLowerCase());
    expect(resolverData.toLowerCase()).toContain(
      addresses.PermissionedResolverImpl.slice(2).toLowerCase(),
    );
    expect(ALL_ROLES).toBe(0x1111111111111111111111111111111111111111111111111111111111111111n);
  });
});

describe("ETHRegistry pointer calldata (labelhash, R3)", () => {
  const dummy = "0x0000000000000000000000000000000000001234" as const;

  it("setSubregistry/setResolver use labelhash anyId, not a stored tokenId", () => {
    const sub = encodeSetSubregistry(labelhashOf(LABEL), dummy);
    const res = encodeSetResolver(labelhashOf(LABEL), dummy);
    expect(sub.slice(0, 10)).toBe(toFunctionSelector("function setSubregistry(uint256,address)"));
    expect(res.slice(0, 10)).toBe(toFunctionSelector("function setResolver(uint256,address)"));
    expect(sub.slice(0, 10)).toBe("0x341ec559");
    expect(res.slice(0, 10)).toBe("0xbc7b6d62");
    const padded = labelhashOf(LABEL).toString(16).padStart(64, "0");
    expect(sub.toLowerCase()).toContain(padded);
    expect(res.toLowerCase()).toContain(padded);
  });

  it("ethRegistryAbi includes the write selectors used on-chain", () => {
    const names = ethRegistryAbi.filter((x) => x.type === "function").map((x) => x.name);
    expect(names).toContain("setSubregistry");
    expect(names).toContain("setResolver");
    expect(names).toContain("getSubregistry");
  });
});

describe("townDeployRecord (broadcast artifact)", () => {
  it("records registry/resolver addresses and never a tokenId", () => {
    const rec = townDeployRecord({
      chainId: 11155111,
      label: LABEL,
      registry: dummyRegistry(),
      resolver: dummyResolver(),
    });
    expect(rec.network).toBe("sepolia");
    expect(rec.name).toBe("botanica.eth");
    expect(rec.env.ENS_TOWN_REGISTRY).toBe(rec.contracts.TownRegistry);
    expect(rec.env.ENS_TOWN_RESOLVER).toBe(rec.contracts.TownResolver);
    expect(JSON.stringify(rec)).not.toMatch(/tokenId/i);
    expect(rec.contracts.TownRegistry).not.toBe(zeroAddress);
  });
});

describe("hackathon bytecode selectors (network)", () => {
  it("factory + impls contain the pinned selectors", async (ctx) => {
    const client = createPublicClient({
      chain: sepolia,
      transport: http(
        process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
        {
          timeout: 8_000,
          retryCount: 0,
        },
      ),
    });
    let factory: `0x${string}` | undefined;
    let userImpl: `0x${string}` | undefined;
    let resolverImpl: `0x${string}` | undefined;
    let ethReg: `0x${string}` | undefined;
    try {
      [factory, userImpl, resolverImpl, ethReg] = await Promise.all([
        client.getCode({ address: addresses.VerifiableFactory }),
        client.getCode({ address: addresses.UserRegistryImpl }),
        client.getCode({ address: addresses.PermissionedResolverImpl }),
        client.getCode({ address: addresses.ETHRegistry }),
      ]);
    } catch {
      ctx.skip();
      return;
    }
    if (!factory || !userImpl || !resolverImpl || !ethReg) {
      ctx.skip();
      return;
    }
    expect(factory).toContain("5d84121a");
    expect(factory).toContain("3d200b45");
    expect(userImpl).toContain("37cb53a8");
    expect(resolverImpl).toContain("33cc44a0");
    expect(ethReg).toContain("341ec559");
    expect(ethReg).toContain("bc7b6d62");
  }, 15_000);
});

function dummyRegistry(): `0x${string}` {
  return "0x1111111111111111111111111111111111111111";
}
function dummyResolver(): `0x${string}` {
  return "0x2222222222222222222222222222222222222222";
}
