// Ledger contract — tick/action/narration persistence (ARCHITECTURE §6.4).
// MemoryLedger backs tests and local runs without Supabase; SupabaseLedger is
// selected when SUPABASE_URL + SUPABASE_SERVICE_KEY are both set.
import type { ActionKind, AgentName, StorylinePhase } from "@agent-town/shared";

export interface TickRow {
  id: number;
  ts: string;
  phase: StorylinePhase;
}

export type ActionStatus = "pending" | "complete" | "failed" | "skipped";

export interface ActionRow {
  tick: number;
  agent: AgentName;
  kind: ActionKind;
  tx: string | null;
  status: ActionStatus;
}

export interface NarrationRow {
  tick: number;
  agent: AgentName;
  text: string;
}

export interface Ledger {
  /** Highest tick id, or 0 when the ledger is empty. */
  getCurrentTick(): Promise<number>;
  listTicks(): Promise<TickRow[]>;
  listActions(): Promise<ActionRow[]>;
  listNarration(): Promise<NarrationRow[]>;
  insertTick(row: TickRow): Promise<void>;
  /** Returns false when (tick, agent, kind) already exists (idempotent skip). */
  insertAction(row: ActionRow): Promise<boolean>;
  findAction(tick: number, agent: AgentName, kind: ActionKind): Promise<ActionRow | undefined>;
  /** Returns false when (tick, agent) already exists (idempotent skip). */
  insertNarration(row: NarrationRow): Promise<boolean>;
}
