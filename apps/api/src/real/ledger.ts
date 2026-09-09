// Supabase tick ledger reader for real-mode /state (ARCHITECTURE §6.4).
import type { ActionKind, AgentName, StorylinePhase } from "@agent-town/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface TickAnchor {
  currentTick: number;
  startedAt: string;
  phase: StorylinePhase;
}

export interface LedgerAction {
  tick: number;
  agent: AgentName;
  kind: ActionKind;
}

export interface LedgerNarration {
  tick: number;
  agent: AgentName;
  text: string;
}

export interface LedgerReader {
  getTickAnchor(): Promise<TickAnchor>;
  latestAction(agent: AgentName): Promise<LedgerAction | undefined>;
  latestNarration(agent: AgentName): Promise<LedgerNarration | undefined>;
}

export class NullLedger implements LedgerReader {
  private readonly startedAt = new Date().toISOString();

  async getTickAnchor(): Promise<TickAnchor> {
    return { currentTick: 0, startedAt: this.startedAt, phase: "boom" };
  }

  async latestAction(): Promise<LedgerAction | undefined> {
    return undefined;
  }

  async latestNarration(): Promise<LedgerNarration | undefined> {
    return undefined;
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
    const { data, error } = await this.client
      .from("ticks")
      .select("id, ts, phase")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Supabase getTickAnchor: ${error.message}`);
    if (!data) {
      return { currentTick: 0, startedAt: new Date().toISOString(), phase: "boom" };
    }
    return {
      currentTick: data.id as number,
      startedAt: data.ts as string,
      phase: data.phase as StorylinePhase,
    };
  }

  async latestAction(agent: AgentName): Promise<LedgerAction | undefined> {
    const { data, error } = await this.client
      .from("actions")
      .select("tick, agent, kind")
      .eq("agent", agent)
      .order("tick", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Supabase latestAction: ${error.message}`);
    if (!data) return undefined;
    return {
      tick: data.tick as number,
      agent: data.agent as AgentName,
      kind: data.kind as ActionKind,
    };
  }

  async latestNarration(agent: AgentName): Promise<LedgerNarration | undefined> {
    const { data, error } = await this.client
      .from("narration")
      .select("tick, agent, text")
      .eq("agent", agent)
      .order("tick", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Supabase latestNarration: ${error.message}`);
    if (!data) return undefined;
    return {
      tick: data.tick as number,
      agent: data.agent as AgentName,
      text: data.text as string,
    };
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
