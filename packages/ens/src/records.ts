// M2.3 encoding: DNS names, Arc coinType addr records, role mapping, ENSIP-26 context.
// Inputs: shared ROSTER + Circle roster wallets. Outputs: calldata for TownRegistrar.register
// and PermissionedResolver setAddress/setText. Never includes tokenIds (R3).
import {
  AGENT_NAMES,
  ENS_ARC_COIN_TYPE,
  ENS_KEYS,
  ROSTER,
  ensNameFor,
  type AgentName,
  type Role,
} from "@agent-town/shared";
import {
  encodeFunctionData,
  getAddress,
  namehash,
  toFunctionSelector,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { packetToBytes } from "viem/ens";
import { townRegistrarAbi } from "./abi/townRegistrar.js";
import { townRegistryAbi } from "./abi/townRegistry.js";
import { townResolverAbi } from "./abi/townResolver.js";
import { resolverProfileAbi } from "./abi/universalResolver.js";

/** ENSIP-11 Arc Testnet coinType: `0x80000000 | 5042002`. */
export const COIN_TYPE_ARC = BigInt(ENS_ARC_COIN_TYPE);
/** SLIP-44 Ethereum; wallets that ignore coinType read this. */
export const COIN_TYPE_ETH = 60n;

/** TownRegistrar.Role enum (ARCHITECTURE §4.3). */
export const RegistrarRole = {
  Treasurer: 0,
  Merchant: 1,
  Worker: 2,
  Consumer: 3,
} as const;
export type RegistrarRoleId = (typeof RegistrarRole)[keyof typeof RegistrarRole];

const ROLE_TO_ENUM: Record<Role, RegistrarRoleId> = {
  treasurer: RegistrarRole.Treasurer,
  merchant: RegistrarRole.Merchant,
  worker: RegistrarRole.Worker,
  consumer: RegistrarRole.Consumer,
};

/** Registry ROOT bits granted to TownRegistrar (DeployTownRegistrar.s.sol). */
export const ROLE_REGISTRAR = 1n << 0n;
export const ROLE_RENEW = 1n << 16n;
export const REGISTRY_REGISTRAR_ROLES = ROLE_REGISTRAR | ROLE_RENEW;

/** Resolver ROOT bits granted to TownRegistrar so it can setText(town.role) on mint. */
export const ROLE_SET_ADDRESS = 1n << 0n;
export const ROLE_SET_TEXT = 1n << 4n;
export const ROLE_SET_ADDRESS_ADMIN = ROLE_SET_ADDRESS << 128n;
export const ROLE_SET_TEXT_ADMIN = ROLE_SET_TEXT << 128n;
export const RESOLVER_REGISTRAR_ROLES =
  ROLE_SET_TEXT | ROLE_SET_TEXT_ADMIN | ROLE_SET_ADDRESS | ROLE_SET_ADDRESS_ADMIN;

/** Placeholder origin for ENS avatar / agent-context endpoints until the FE is live. */
export const DEFAULT_APP_ORIGIN = "http://localhost:3000";

export function registrarRoleOf(role: Role): RegistrarRoleId {
  const id = ROLE_TO_ENUM[role];
  if (id === undefined) throw new Error(`unknown role: ${role}`);
  return id;
}

export function rosterRoleOf(name: AgentName): Role {
  const entry = ROSTER.find((r) => r.name === name);
  if (!entry) throw new Error(`Unknown roster agent: ${name}`);
  return entry.role;
}

/** DNS wire encoding of `{label}.{town}.eth` — matches `DnsCodec.encodeTownName`. */
export function dnsEncodeName(name: string): Hex {
  return toHex(packetToBytes(name));
}

export function dnsEncodeTownName(label: string, town: string): Hex {
  return dnsEncodeName(`${label}.${town}.eth`);
}

/** 20-byte packed EVM address for `setAddress(..., bytes)`. */
export function encodeEvmAddressBytes(addr: Address): Hex {
  return getAddress(addr).toLowerCase() as Hex;
}

export function avatarUrl(name: AgentName, origin: string = DEFAULT_APP_ORIGIN): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/sprites/${name}.png`;
}

export function agentEndpointWeb(name: AgentName, origin: string = DEFAULT_APP_ORIGIN): string {
  return `${origin.replace(/\/$/, "")}/agents/${name}`;
}

/** ENSIP-26 `agent-context` markdown: role, town, endpoints, registry pointers. */
export function agentContextMarkdown(opts: {
  name: AgentName;
  town: string;
  role: Role;
  wallet: Address;
  origin?: string;
  registry: Address;
  resolver: Address;
}): string {
  const origin = opts.origin ?? DEFAULT_APP_ORIGIN;
  const ens = ensNameFor(opts.name, opts.town);
  return [
    `# ${ens}`,
    "",
    `- role: ${opts.role}`,
    `- town: ${opts.town}`,
    `- chain: Arc Testnet (5042002)`,
    `- wallet: ${getAddress(opts.wallet)}`,
    `- coinType: ${ENS_ARC_COIN_TYPE} (ENSIP-11) and 60 (ETH)`,
    `- endpoint[web]: ${agentEndpointWeb(opts.name, origin)}`,
    `- registry: ${getAddress(opts.registry)}`,
    `- resolver: ${getAddress(opts.resolver)}`,
  ].join("\n");
}

export function encodeGrantRootRoles(roleBitmap: bigint, account: Address): Hex {
  return encodeFunctionData({
    abi: townRegistryAbi,
    functionName: "grantRootRoles",
    args: [roleBitmap, account],
  });
}

export function encodeRegister(label: string, owner: Address, role: RegistrarRoleId): Hex {
  return encodeFunctionData({
    abi: townRegistrarAbi,
    functionName: "register",
    args: [label, owner, role],
  });
}

export function encodeSetAddress(dnsName: Hex, coinType: bigint, addr: Address): Hex {
  return encodeFunctionData({
    abi: townResolverAbi,
    functionName: "setAddress",
    args: [dnsName, coinType, encodeEvmAddressBytes(addr)],
  });
}

export function encodeSetText(dnsName: Hex, key: string, value: string): Hex {
  return encodeFunctionData({
    abi: townResolverAbi,
    functionName: "setText",
    args: [dnsName, key, value],
  });
}

export function encodeResolverMulticall(calls: Hex[]): Hex {
  return encodeFunctionData({
    abi: townResolverAbi,
    functionName: "multicall",
    args: [calls],
  });
}

export function encodeResolveAddr(node: Hex, coinType: bigint): Hex {
  return encodeFunctionData({
    abi: resolverProfileAbi,
    functionName: "addr",
    args: [node, coinType],
  });
}

export function encodeResolveText(node: Hex, key: string): Hex {
  return encodeFunctionData({
    abi: resolverProfileAbi,
    functionName: "text",
    args: [node, key],
  });
}

export interface AgentMintPlan {
  name: AgentName;
  role: Role;
  registrarRole: RegistrarRoleId;
  ensName: string;
  dnsName: Hex;
  node: Hex;
  owner: Address;
  wallet: Address;
  avatar: string;
  agentContext: string;
  calls: {
    register: Hex;
    setAddrArc: Hex;
    setAddrEth: Hex;
    setAgentContext: Hex;
    setTownRole: Hex;
    setAvatar: Hex;
    recordsMulticall: Hex;
    resolveAddrArc: Hex;
    resolveAddrEth: Hex;
  };
}

export interface MintPlan {
  townLabel: string;
  registry: Address;
  resolver: Address;
  grants: { registry: Hex; resolver: Hex };
  agents: AgentMintPlan[];
}

export function buildMintPlan(opts: {
  townLabel: string;
  registry: Address;
  resolver: Address;
  registrar: Address;
  wallets: Record<AgentName, Address>;
  origin?: string;
}): MintPlan {
  const origin = opts.origin ?? DEFAULT_APP_ORIGIN;
  const agents: AgentMintPlan[] = AGENT_NAMES.map((name) => {
    const role = rosterRoleOf(name);
    const registrarRole = registrarRoleOf(role);
    const walletRaw = opts.wallets[name];
    if (!walletRaw) throw new Error(`missing wallet for ${name}`);
    const wallet = getAddress(walletRaw);
    const ensName = ensNameFor(name, opts.townLabel);
    const dnsName = dnsEncodeName(ensName);
    const node = namehash(ensName);
    const avatar = avatarUrl(name, origin);
    const agentContext = agentContextMarkdown({
      name,
      town: opts.townLabel,
      role,
      wallet,
      origin,
      registry: opts.registry,
      resolver: opts.resolver,
    });
    const setAddrArc = encodeSetAddress(dnsName, COIN_TYPE_ARC, wallet);
    const setAddrEth = encodeSetAddress(dnsName, COIN_TYPE_ETH, wallet);
    const setAgentContext = encodeSetText(dnsName, ENS_KEYS.agentContext, agentContext);
    const setTownRole = encodeSetText(dnsName, ENS_KEYS.role, role);
    const setAvatar = encodeSetText(dnsName, ENS_KEYS.avatar, avatar);
    return {
      name,
      role,
      registrarRole,
      ensName,
      dnsName,
      node,
      owner: wallet,
      wallet,
      avatar,
      agentContext,
      calls: {
        register: encodeRegister(name, wallet, registrarRole),
        setAddrArc,
        setAddrEth,
        setAgentContext,
        setTownRole,
        setAvatar,
        recordsMulticall: encodeResolverMulticall([
          setAddrArc,
          setAddrEth,
          setAgentContext,
          setTownRole,
          setAvatar,
        ]),
        resolveAddrArc: encodeResolveAddr(node, COIN_TYPE_ARC),
        resolveAddrEth: encodeResolveAddr(node, COIN_TYPE_ETH),
      },
    };
  });
  return {
    townLabel: opts.townLabel,
    registry: getAddress(opts.registry),
    resolver: getAddress(opts.resolver),
    grants: {
      registry: encodeGrantRootRoles(REGISTRY_REGISTRAR_ROLES, opts.registrar),
      resolver: encodeGrantRootRoles(RESOLVER_REGISTRAR_ROLES, opts.registrar),
    },
    agents,
  };
}

export const SET_ADDRESS_SELECTOR = toFunctionSelector(
  "function setAddress(bytes name, uint256 coinType, bytes addressBytes)",
);
export const SET_ADDR_NAMECHAIN_SELECTOR = toFunctionSelector(
  "function setAddr(bytes32 node, uint256 coinType, bytes data)",
);
export const REGISTER_SELECTOR = toFunctionSelector(
  "function register(string label, address owner, uint8 role)",
);
