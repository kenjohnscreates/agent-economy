// In-memory ledger — default for vitest and runs without Supabase credentials.
// Mirrors the Supabase schema with a unique (tick, agent, kind) constraint on
// actions so idempotency behaviour matches production.
import type { ActionRow, Ledger, TickRow } from "./types.js";

function actionKey(row: ActionRow): string {
  return `${row.tick}:${row.agent}:${row.kind}`;
}

export class MemoryLedger implements Ledger {
  private ticks: TickRow[] = [];
  private actions: ActionRow[] = [];
  private actionKeys = new Set<string>();

  async getCurrentTick(): Promise<number> {
    if (this.ticks.length === 0) return 0;
    return Math.max(...this.ticks.map((t) => t.id));
  }

  async listTicks(): Promise<TickRow[]> {
    return [...this.ticks].sort((a, b) => a.id - b.id);
  }

  async listActions(): Promise<ActionRow[]> {
    return [...this.actions];
  }

  async insertTick(row: TickRow): Promise<void> {
    this.ticks.push({ ...row });
  }

  async insertAction(row: ActionRow): Promise<boolean> {
    const key = actionKey(row);
    if (this.actionKeys.has(key)) return false;
    this.actionKeys.add(key);
    this.actions.push({ ...row });
    return true;
  }
}
