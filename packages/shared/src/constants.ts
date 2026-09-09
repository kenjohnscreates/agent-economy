// Chain constants for Agent Town — source of truth: docs/ARCHITECTURE.md §2.
// Inputs: none (static). Outputs: readonly literals typed `as const`.
// Arc Testnet is the primary chain (USDC-gas L1); Sepolia hosts ENSv2.
// Two USDC decimals exist on Arc: ERC-20 interface = 6, native gas = 18.
// Never mix them — all app/contract math uses the 6-decimal ERC-20 interface.

/** EVM address literal type (0x-prefixed hex). */
export type Address = `0x${string}`;

/** Arc Testnet chain id (Circle's USDC-gas L1). */
export const ARC_TESTNET_CHAIN_ID = 5042002 as const;

/** Default public Arc Testnet RPC (alts: blockdaemon/drpc/quicknode subdomains). */
export const ARC_RPC_URL_DEFAULT = "https://rpc.testnet.arc.io" as const;

/** Arc Testnet block explorer base URL. */
export const ARC_EXPLORER_URL = "https://testnet.arcscan.app" as const;

/**
 * USDC ERC-20 interface on Arc — 6 decimals.
 * All contract and app math uses this interface. No wrapped USDC exists.
 */
export const ARC_USDC_ADDRESS: Address = "0x3600000000000000000000000000000000000000" as const;

/** Decimals of the USDC ERC-20 interface on Arc. */
export const ARC_USDC_DECIMALS = 6 as const;

/**
 * Decimals of the *native* gas balance on Arc (eth_getBalance / gas math only).
 * Never mix with ERC-20 amounts — they differ by 1e12.
 */
export const ARC_NATIVE_GAS_DECIMALS = 18 as const;

/** ERC-8183 (jobs) reference contract on Arc Testnet. */
export const ERC8183_ADDRESS: Address = "0x0747EEf0706327138c69792bF28Cd525089e4583" as const;

/** Ethereum Sepolia chain id (ENSv2 hackathon deployment lives here). */
export const SEPOLIA_CHAIN_ID = 11155111 as const;

/** ENSIP-11 coinType for Arc Testnet: 0x80000000 | 5042002 = 2152525650. */
export const ENS_ARC_COIN_TYPE = 2152525650 as const;
