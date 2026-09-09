// ENS text-record keys written per agent name — source: ARCHITECTURE §4.4.
// Inputs: none (static). Outputs: `ENS_KEYS` map and the `EnsReview` schema for
// the JSON array stored under `town.reviews` (treasurer-only writer).
// Address records use ENSIP-11 coinType `ENS_ARC_COIN_TYPE` (constants.ts).
import { z } from "zod";

/** Text record keys; `town.*` are custom, the rest are ENSIP-5/ENSIP-26 standard. */
export const ENS_KEYS = {
  role: "town.role",
  creditScore: "town.credit-score",
  reviews: "town.reviews",
  price: "town.price",
  agentContext: "agent-context",
  agentEndpointWeb: "agent-endpoint[web]",
  avatar: "avatar",
} as const;
export type EnsKey = (typeof ENS_KEYS)[keyof typeof ENS_KEYS];

/** One entry of the `town.reviews` JSON array. */
export const EnsReviewSchema = z.object({
  /** Reviewer agent label (normally the treasurer). */
  by: z.string().min(1),
  tick: z.int().nonnegative(),
  /** 0–100, same scale as `town.credit-score`. */
  score: z.int().min(0).max(100),
  note: z.string().max(200),
});
export type EnsReview = z.infer<typeof EnsReviewSchema>;

/** Full `town.reviews` record value (parsed from JSON). */
export const EnsReviewsSchema = z.array(EnsReviewSchema);
