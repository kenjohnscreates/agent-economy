// Ledger factory — picks MemoryLedger or SupabaseLedger from config.
import type { SimConfig } from "../config.js";
import { MemoryLedger } from "./memory.js";
import { SupabaseLedger } from "./supabase.js";
import type { Ledger } from "./types.js";

export type { ActionRow, ActionStatus, Ledger, TickRow } from "./types.js";
export { MemoryLedger } from "./memory.js";
export { SupabaseLedger } from "./supabase.js";

export function createLedger(config: SimConfig): Ledger {
  if (config.supabaseUrl && config.supabaseServiceKey) {
    return new SupabaseLedger(config.supabaseUrl, config.supabaseServiceKey);
  }
  return new MemoryLedger();
}
