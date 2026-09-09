/**
 * gdpSeries — cumulative town GDP by hour or day.
 * TownDaily aggregation works on Studio but includes all ERC-8183 completions;
 * we aggregate roster-filtered job_pay payments so random contract jobs are excluded.
 */
import type { GraphQLClient } from "graphql-request";
import { createSdk } from "../sdk.js";
import { townRosterAddresses } from "../roster.js";
import { GdpSeriesSchema, type GdpSeries } from "../schemas.js";

export type GdpInterval = "hour" | "day";

export type GdpSeriesOptions = {
  interval?: GdpInterval;
  /** Max payments to scan when deriving from roster (Studio pagination cap). */
  first?: number;
};

const DEFAULT_FIRST = 1000;
const SECONDS_PER_HOUR = 3600n;
const SECONDS_PER_DAY = 86_400n;

function bucketKey(timestampSec: bigint, interval: GdpInterval): string {
  const divisor = interval === "hour" ? SECONDS_PER_HOUR : SECONDS_PER_DAY;
  return (timestampSec / divisor).toString();
}

function aggregatePayments(
  payments: { amount: string; timestamp: string }[],
  interval: GdpInterval,
): { timestamp: string; gdpUsdc: string }[] {
  const buckets = new Map<string, bigint>();
  for (const payment of payments) {
    const ts = BigInt(payment.timestamp);
    const key = bucketKey(ts, interval);
    const prev = buckets.get(key) ?? 0n;
    buckets.set(key, prev + BigInt(payment.amount));
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (BigInt(a) < BigInt(b) ? -1 : 1))
    .map(([key, total]) => ({
      timestamp: key,
      gdpUsdc: total.toString(),
    }));
}

export async function gdpSeries(
  client: GraphQLClient,
  options: GdpSeriesOptions = {},
): Promise<GdpSeries> {
  const interval = options.interval ?? "day";
  const sdk = createSdk(client);
  const roster = [...townRosterAddresses()];

  // TownDaily is available on Graph 1.2 Studio but sums TownStat from the shared
  // ERC-8183 contract (all users). Roster-filtered payments are town GDP only.
  const paymentsRes = await sdk.TownJobPayments({
    roster,
    first: options.first ?? DEFAULT_FIRST,
  });

  return GdpSeriesSchema.parse({
    interval,
    source: "rosterPayments",
    points: aggregatePayments(paymentsRes.payments, interval),
  });
}
