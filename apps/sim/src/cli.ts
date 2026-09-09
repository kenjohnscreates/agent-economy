// CLI entry for `pnpm --filter @agent-town/sim tick`.
// Supports default loop, `--once` (one tick, no wait) and `--ticks N`.
// Live execution (Gate A): ALLOW_BROADCAST=true AND (--yes | SIM_EXECUTE=on).
import { ARC_RPC_URL_DEFAULT, ARC_TESTNET_CHAIN_ID, ARC_USDC_ADDRESS } from "@agent-town/shared";
import {
  createCircleClient,
  jobIdFromLogs,
  readRoster,
  resolveTreasuryAddress,
} from "@agent-town/circle";
import { createPublicClient, defineChain, http, type Hex } from "viem";
import { parseCliOptions, parseSimConfig } from "./config.js";
import { createExecuteAction } from "./execute.js";
import { runLoop, runTicks, type TickDeps } from "./engine.js";
import { createLedger } from "./ledger/index.js";
import { createSdkLlmProvider } from "./llm-sdk.js";
import { createQuerySubgraph } from "./query-subgraph.js";
import { createDefaultGetWorld } from "./world.js";

const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || ARC_RPC_URL_DEFAULT] } },
});

function buildTickDeps(config: ReturnType<typeof parseSimConfig>): TickDeps {
  const deps: TickDeps = {
    getWorld: createDefaultGetWorld(process.env),
  };
  if (config.flags.llmAdvisor && config.llmProvider !== "off") {
    deps.advisorProvider = createSdkLlmProvider(config.llmProvider);
    try {
      deps.querySubgraph = createQuerySubgraph();
    } catch {
      // SUBGRAPH_URL missing — tool omitted; advise still runs on WorldState signals.
    }
  }
  if (!config.executeEnabled) return deps;
  const client = createCircleClient(process.env);
  const pub = createPublicClient({ chain: arcTestnet, transport: http() });
  deps.executeAction = createExecuteAction({
    client,
    roster: readRoster(),
    treasuryAddress: resolveTreasuryAddress(process.env),
    tickMs: config.tickMs,
    jobIdFromTxHash: async (txHash: string) => {
      const receipt = await pub.getTransactionReceipt({ hash: txHash as Hex });
      return jobIdFromLogs(receipt.logs).toString();
    },
  });
  return deps;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cli = parseCliOptions(argv);
  const config = parseSimConfig(process.env, cli);
  const ledger = createLedger(config);
  const deps = buildTickDeps(config);

  console.log(`[sim] booting — Arc USDC (ERC-20, 6 dec): ${ARC_USDC_ADDRESS}`);
  console.log(
    `[sim] flags advisor=${config.flags.llmAdvisor} narrator=${config.flags.llmNarrator} ` +
      `signals=${config.flags.externalSignals} storyline=${config.flags.storyline}`,
  );
  console.log(
    `[sim] execute=${config.executeEnabled ? "LIVE" : "dry-run"} ` +
      `(ALLOW_BROADCAST + --yes|SIM_EXECUTE=on; approve M4.3 before live tick)`,
  );

  if (cli.once) {
    await runTicks(ledger, config, 1, deps);
  } else if (cli.ticks !== undefined) {
    await runTicks(ledger, config, cli.ticks, deps);
  } else {
    await runLoop(ledger, config, deps);
  }
}

main().catch((err: unknown) => {
  console.error("[sim] fatal:", err);
  process.exit(1);
});
