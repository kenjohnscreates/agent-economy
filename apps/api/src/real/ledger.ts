// Supabase tick ledger reader for real-mode /state (ARCHITECTURE §6.4).
import type { ActionKind, AgentName, StorylinePhase } from "@agent-town/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ActionStatus = "pending" | "complete" | "failed" | "skipped";

export interface TickAnchor {
  currentTick: number;
  /** ISO ts of tick id=1 (sim start), not the latest tick row. */
  startedAt: string;
  phase: StorylinePhase;
}

export interface LedgerAction {
  tick: number;
  agent: AgentName;
  kind: ActionKind;
  tx: string | null;
  status: ActionStatus;
}

export interface LedgerNarration {
  tick: number;
  agent: AgentName;
  text: string;
}

export interface LedgerReader {
  getTickAnchor(): Promise<TickAnchor>;
  listActions(): Promise<LedgerAction[]>;
  listNarration(): Promise<LedgerNarration[]>;
}

/** Highest-tick row for an agent from an already-fetched list (avoid per-agent queries). */
export function latestByTick<T extends { agent: string; tick: number }>(
  rows: readonly T[],
  agent: string,
): T | undefined {
  let best: T | undefined;
  for (const row of rows) {
    if (row.agent !== agent) continue;
    if (!best || row.tick > best.tick) best = row;
  }
  return best;
}

export class NullLedger implements LedgerReader {
  private readonly startedAt = new Date().toISOString();

  async getTickAnchor(): Promise<TickAnchor> {
    return { currentTick: 0, startedAt: this.startedAt, phase: "boom" };
  }

  async listActions(): Promise<LedgerAction[]> {
    return [];
  }

  async listNarration(): Promise<LedgerNarration[]> {
    return [];
  }
}

export class SupabaseLedgerReader implements LedgerReader {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async getTickAnchor(): Promise<TickAnchor> {
    const [latestRes, firstRes] = await Promise.all([
      this.client
        .from("ticks")
        .select("id, ts, phase")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
      this.client
        .from("ticks")
        .select("ts")
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    if (latestRes.error) throw new Error(`Supabase getTickAnchor: ${latestRes.error.message}`);
    if (firstRes.error) throw new Error(`Supabase getTickAnchor first: ${firstRes.error.message}`);

    const latest = latestRes.data;
    const first = firstRes.data;
    if (!latest) {
      return { currentTick: 0, startedAt: new Date().toISOString(), phase: "boom" };
    }
    return {
      currentTick: latest.id as number,
      startedAt: (first?.ts as string | undefined) ?? (latest.ts as string),
      phase: latest.phase as StorylinePhase,
    };
  }

  async listActions(): Promise<LedgerAction[]> {
    const { data, error } = await this.client.from("actions").select("tick, agent, kind, tx, status");
    if (error) throw new Error(`Supabase listActions: ${error.message}`);
    return (data ?? []).map((row) => ({
      tick: row.tick as number,
      agent: row.agent as AgentName,
      kind: row.kind as ActionKind,
      tx: (row.tx as string | null) ?? null,
      status: row.status as ActionStatus,
    }));
  }

  async listNarration(): Promise<LedgerNarration[]> {
    const { data, error } = await this.client.from("narration").select("tick, agent, text");
    if (error) throw new Error(`Supabase listNarration: ${error.message}`);
    return (data ?? []).map((row) => ({
      tick: row.tick as number,
      agent: row.agent as AgentName,
      text: row.text as string,
    }));
  }
}

export function createLedgerReader(env: {
  supabaseUrl?: string;
  supabaseServiceKey?: string;
}): LedgerReader {
  if (env.supabaseUrl && env.supabaseServiceKey) {
    return new SupabaseLedgerReader(env.supabaseUrl, env.supabaseServiceKey);
  }
  return new NullLedger();
}
