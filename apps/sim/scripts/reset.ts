#!/usr/bin/env tsx
// `pnpm reset` — clear persisted sim ledger (Supabase ticks/actions/narration).
// Does not broadcast or re-seed wallets unless you opt in separately (--yes hints only).
// Never logs secrets.
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";

const { values: flags } = parseArgs({
  options: {
    yes: { type: "boolean", default: false },
  },
  strict: true,
});

const url = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_KEY?.trim();

async function truncateSupabaseLedger(): Promise<boolean> {
  if (!url || !serviceKey) return false;

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const table of ["actions", "narration"] as const) {
    const { error } = await client.from(table).delete().gte("tick", 0);
    if (error) throw new Error(`reset ${table}: ${error.message}`);
  }

  const { error: tickErr } = await client.from("ticks").delete().gte("id", 0);
  if (tickErr) throw new Error(`reset ticks: ${tickErr.message}`);

  return true;
}

async function main(): Promise<void> {
  console.log("[reset] Agent Town sim ledger reset");

  if (!url || !serviceKey) {
    console.log(
      "[reset] No SUPABASE_URL + SUPABASE_SERVICE_KEY — no remote ledger to clear.",
    );
    console.log("[reset] Local `pnpm tick` runs use an in-memory ledger unless Supabase is configured.");
    console.log(
      "[reset] To wipe a hosted ledger: set Supabase creds in .env, apply apps/sim/supabase/migrations/001_ledger.sql, then re-run `pnpm reset`.",
    );
  } else {
    await truncateSupabaseLedger();
    console.log("[reset] Cleared Supabase tables: actions, narration, ticks (tick → 0).");
    console.log(
      "[reset] Optional: truncate cache_agents in the Supabase SQL editor if you cache agent JSON.",
    );
  }

  if (flags.yes) {
    console.log(
      "[reset] To re-seed on-chain wallets after a wipe: pnpm --filter @agent-town/circle fund --yes",
    );
    console.log("[reset] Live sim ticks still require ALLOW_BROADCAST=true and `pnpm tick --yes`.");
  } else {
    console.log("[reset] Pass --yes to print wallet re-seed commands (does not broadcast by itself).");
  }
}

main().catch((err: unknown) => {
  console.error("[reset] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
