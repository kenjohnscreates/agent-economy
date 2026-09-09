// CLI entry for `pnpm --filter @agent-town/sim tick`.
// Supports default loop, `--once` (one tick, no wait) and `--ticks N`.
import { ARC_USDC_ADDRESS } from "@agent-town/shared";
import { parseCliOptions, parseSimConfig } from "./config.js";
import { runLoop, runTicks } from "./engine.js";
import { createLedger } from "./ledger/index.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const config = parseSimConfig(process.env);
  const cli = parseCliOptions(argv);
  const ledger = createLedger(config);

  console.log(`[sim] booting — Arc USDC (ERC-20, 6 dec): ${ARC_USDC_ADDRESS}`);
  console.log(
    `[sim] flags advisor=${config.flags.llmAdvisor} narrator=${config.flags.llmNarrator} ` +
      `signals=${config.flags.externalSignals} storyline=${config.flags.storyline}`,
  );

  if (cli.once) {
    await runTicks(ledger, config, 1);
  } else if (cli.ticks !== undefined) {
    await runTicks(ledger, config, cli.ticks);
  } else {
    await runLoop(ledger, config);
  }
}

main().catch((err: unknown) => {
  console.error("[sim] fatal:", err);
  process.exit(1);
});
