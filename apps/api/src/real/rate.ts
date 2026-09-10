// Priced town-rate stack for the real scoreboard tooltip.
// Spread is always BASE_RATE_SPREAD_BPS — do not derive it from on-chain
// baseRateBps (that already includes premium after ada set_rate).
import {
  BASE_RATE_SPREAD_BPS,
  DEFAULT_PREMIUM_BPS,
  computeTownRateBps,
  type RateBreakdown,
} from "@agent-town/shared";

export interface RateBreakdownInputs {
  marketApyBps: number;
  onChainBaseRateBps: number;
  defaults: number;
  utilisationBps: number;
}

export function buildRateBreakdown({
  marketApyBps,
  onChainBaseRateBps,
  defaults,
  utilisationBps,
}: RateBreakdownInputs): RateBreakdown {
  const spreadBps = BASE_RATE_SPREAD_BPS;
  const defaultPremiumBps = defaults > 0 ? DEFAULT_PREMIUM_BPS : 0;
  return {
    marketApyBps,
    spreadBps,
    defaultPremiumBps,
    utilisationBps,
    // On-chain sb.baseRateBps is the contract source of truth (mayor override OK).
    baseRateBps: onChainBaseRateBps,
    townRateBps: computeTownRateBps({
      marketApyBps,
      spreadBps,
      defaultPremiumBps,
    }),
  };
}
