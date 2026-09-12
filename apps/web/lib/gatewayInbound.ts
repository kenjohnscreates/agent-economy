// Already-settled Circle Gateway mint (M9.1). Do not re-run gateway-deposit.
// Public hashes only — copied from packages/circle/gateway-gus.json.
import { ARC_EXPLORER_URL } from "@agent-town/shared";

export const GATEWAY_INBOUND = {
  agent: "gus",
  source: "Ethereum Sepolia",
  dest: "Arc",
  amountUsdc: "800000",
  mintTxHash: "0x14fad3ea624b2343524282dabe26f35900b8e30b0f4e2021516b2cb523a5d3ea",
  sepoliaDepositTxHash: "0x27c49e4d9c0b4bb170ffdc3f7e04257b023ccec60d454df0d678392ac15dc54c",
} as const;

export function gatewayMintExplorerUrl(): string {
  return `${ARC_EXPLORER_URL}/tx/${GATEWAY_INBOUND.mintTxHash}`;
}
