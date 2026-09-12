// Optional last-good loan book when Studio 429 leaves a fresh API with an empty cache.
// GRAPH_LAST_GOOD_LOANS = path to a JSON array matching GET /loans (public data).
import { readFileSync } from "node:fs";
import { LoansResponseSchema, type Loan } from "@agent-town/shared";

export function readSeedLoans(env: NodeJS.ProcessEnv = process.env): Loan[] {
  const path = env.GRAPH_LAST_GOOD_LOANS?.trim();
  if (!path) return [];
  try {
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    return LoansResponseSchema.parse(raw);
  } catch (err) {
    console.warn("[api] GRAPH_LAST_GOOD_LOANS unreadable:", err);
    return [];
  }
}
