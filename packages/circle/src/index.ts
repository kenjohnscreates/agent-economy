// @agent-town/circle — Circle Developer-Controlled SCA wallets wrapper for Arc Testnet.
// Create (idempotent, roster.json), execute (contract call / USDC transfer), poll to
// terminal state. All amounts are 6-dec USDC base-unit strings at this boundary.
export const PACKAGE = "@agent-town/circle" as const;

export * from "./client.js";
export * from "./amounts.js";
export * from "./roster.js";
export * from "./wallets.js";
export * from "./execute.js";
