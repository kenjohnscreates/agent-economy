// @agent-town/api — REST + SSE backend entry point (ARCHITECTURE §6.3).
// Currently a smoke-test stub proving the workspace link to @agent-town/shared.
// The HTTP framework (Hono) and routes arrive in card M0.7.
import { ARC_USDC_ADDRESS } from "@agent-town/shared";

console.log(`[api] booting — Arc USDC (ERC-20, 6 dec): ${ARC_USDC_ADDRESS}`);
