// Prints, per roster wallet, the USDC ERC-20 balance (6 dec, via Circle balances
// API — decimal string) and the native gas balance (18 dec, via viem eth_getBalance).
// Two different decimals on purpose — see src/amounts.ts. Read-only; needs CIRCLE_*
// env for the Circle half; native half only needs ARC_RPC_URL (public default).
//   pnpm --filter @agent-town/circle balances
import { ARC_RPC_URL_DEFAULT, ARC_TESTNET_CHAIN_ID, ARC_USDC_ADDRESS } from "@agent-town/shared";
import { createPublicClient, defineChain, http } from "viem";
import {
  createCircleClient,
  fromUsdcDecimalString,
  nativeToDecimalString,
  readRoster,
} from "../src/index.js";

const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || ARC_RPC_URL_DEFAULT] } },
});

async function main() {
  const roster = readRoster();
  if (roster.wallets.length === 0) {
    console.log("roster.json is empty — run setup-wallets first.");
    return;
  }
  const circle = createCircleClient(process.env);
  const pub = createPublicClient({ chain: arcTestnet, transport: http() });

  console.log(
    `wallet  address                                     USDC ERC-20 (6 dec)          native gas (18 dec)`,
  );
  for (const w of roster.wallets) {
    const [bal, native] = await Promise.all([
      circle.getWalletTokenBalance({ id: w.walletId, tokenAddresses: [ARC_USDC_ADDRESS] }),
      pub.getBalance({ address: w.address as `0x${string}` }),
    ]);
    const usdc = bal.data?.tokenBalances?.find(
      (b) => b.token.tokenAddress?.toLowerCase() === ARC_USDC_ADDRESS.toLowerCase(),
    );
    const usdcDec = usdc?.amount ?? "0";
    const usdcBase = fromUsdcDecimalString(usdcDec);
    console.log(
      `${w.name.padEnd(7)} ${w.address}  ${usdcDec.padEnd(12)} (${usdcBase} base)`.padEnd(95) +
        `${nativeToDecimalString(native)} (${native.toString()} wei)`,
    );
  }
}

main().catch((e: unknown) => {
  console.error(`balances failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
