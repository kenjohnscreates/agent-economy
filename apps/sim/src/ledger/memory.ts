// In-memory ledger — default for vitest and runs without Supabase credentials.
// Mirrors the Supabase schema: unique (tick, agent, kind) on actions and
// unique (tick, agent) on narration so idempotency matches production.
import type { ActionRow, Ledger, NarrationRow, TickRow } from "./types.js";

function actionKey(row: ActionRow): string {
  return `${row.tick}:${row.agent}:${row.kind}`;
}

function narrationKey(row: Pick<NarrationRow, "tick" | "agent">): string {
  return `${row.tick}:${row.agent}`;
}

export class MemoryLedger implements Ledger {
  private ticks: TickRow[] = [];
  private actions: ActionRow[] = [];
  private narration: NarrationRow[] = [];
  private actionKeys = new Set<string>();
  private narrationKeys = new Set<string>();

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

  async listNarration(): Promise<NarrationRow[]> {
    return [...this.narration].sort((a, b) => a.tick - b.tick || a.agent.localeCompare(b.agent));
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

  async findAction(
    tick: number,
    agent: ActionRow["agent"],
    kind: ActionRow["kind"],
  ): Promise<ActionRow | undefined> {
    return this.actions.find((a) => a.tick === tick && a.agent === agent && a.kind === kind);
  }

  async insertNarration(row: NarrationRow): Promise<boolean> {
    const key = narrationKey(row);
    if (this.narrationKeys.has(key)) return false;
    this.narrationKeys.add(key);
    this.narration.push({ ...row });
    return true;
  }
}
