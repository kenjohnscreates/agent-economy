// @agent-town/sim — package entry (smoke test). Use `pnpm tick` for the engine CLI.
import { ARC_USDC_ADDRESS } from "@agent-town/shared";

console.log(`[sim] booting — Arc USDC (ERC-20, 6 dec): ${ARC_USDC_ADDRESS}`);
console.log("[sim] run the tick engine: pnpm --filter @agent-town/sim tick");
