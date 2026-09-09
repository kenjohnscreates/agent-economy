// Supabase ledger adapter — persists ticks and actions to Postgres (§6.4).
// Only loaded when SUPABASE_URL and SUPABASE_SERVICE_KEY are configured; tests
// use MemoryLedger so this module never hits the network in CI.
import type { AgentName, ActionKind } from "@agent-town/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ActionRow, Ledger, TickRow } from "./types.js";

export class SupabaseLedger implements Ledger {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async getCurrentTick(): Promise<number> {
    const { data, error } = await this.client
      .from("ticks")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Supabase getCurrentTick: ${error.message}`);
    return data?.id ?? 0;
  }

  async listTicks(): Promise<TickRow[]> {
    const { data, error } = await this.client.from("ticks").select("*").order("id");
    if (error) throw new Error(`Supabase listTicks: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: row.id as number,
      ts: row.ts as string,
      phase: row.phase as TickRow["phase"],
    }));
  }

  async listActions(): Promise<ActionRow[]> {
    const { data, error } = await this.client.from("actions").select("*");
    if (error) throw new Error(`Supabase listActions: ${error.message}`);
    return (data ?? []).map((row) => ({
      tick: row.tick as number,
      agent: row.agent as AgentName,
      kind: row.kind as ActionKind,
      tx: (row.tx as string | null) ?? null,
      status: row.status as ActionRow["status"],
    }));
  }

  async insertTick(row: TickRow): Promise<void> {
    const { error } = await this.client.from("ticks").insert({
      id: row.id,
      ts: row.ts,
      phase: row.phase,
    });
    if (error) throw new Error(`Supabase insertTick: ${error.message}`);
  }

  async insertAction(row: ActionRow): Promise<boolean> {
    const { error } = await this.client.from("actions").insert({
      tick: row.tick,
      agent: row.agent,
      kind: row.kind,
      tx: row.tx,
      status: row.status,
    });
    if (error?.code === "23505") return false;
    if (error) throw new Error(`Supabase insertAction: ${error.message}`);
    return true;
  }
}
