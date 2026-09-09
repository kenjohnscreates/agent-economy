// Arc ERC-20 USDC balances via viem (6-dec base units).
import { ARC_USDC_ADDRESS, type Address } from "@agent-town/shared";
import { createPublicClient, http, type PublicClient } from "viem";
import { parseAbi } from "viem";

const erc20Abi = parseAbi(["function balanceOf(address account) view returns (uint256)"]);

export type BalanceReader = (address: Address) => Promise<string>;

let cachedClient: PublicClient | undefined;

function publicClient(rpcUrl: string): PublicClient {
  if (!cachedClient) {
    cachedClient = createPublicClient({
      transport: http(rpcUrl),
    });
  }
  return cachedClient;
}

export function createBalanceReader(rpcUrl?: string): BalanceReader {
  if (!rpcUrl) {
    return async () => "0";
  }
  const client = publicClient(rpcUrl);
  const token = ARC_USDC_ADDRESS as Address;
  return async (address: Address) => {
    const balance = await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
    return balance.toString();
  };
}

/** Test seam — reset viem client between tests. */
export function resetBalanceReaderCache(): void {
  cachedClient = undefined;
}
