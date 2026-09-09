// Demo storyline scheduler — PRD §12 script actions at ticks 1,4,7,9,11.
import { describe, expect, it } from "vitest";
import { parseSimConfig } from "./config.js";
import { runTicks } from "./engine.js";
import { MemoryLedger } from "./ledger/index.js";
import { patchDemoWorld } from "./storyline-hooks.js";
import { emptyWorld } from "./world.js";

function testConfig(overrides: Record<string, string> = {}) {
  return parseSimConfig({
    TICK_MS: "100",
    MAX_TICKS: "50",
    STORYLINE: "demo",
    ...overrides,
  });
}

async function actionsAtTick(ledger: MemoryLedger, tick: number) {
  return (await ledger.listActions()).filter((a) => a.tick === tick);
}

describe("demo storyline scheduler (M4.8)", () => {
  const demoCases = [
    { tick: 1, agent: "gus", kind: "buy" as const },
    { tick: 4, agent: "bo", kind: "request_loan" as const },
    { tick: 7, agent: "ada", kind: "mark_default" as const },
    { tick: 9, agent: "ada", kind: "set_rate" as const },
    { tick: 11, agent: "bo", kind: "repay" as const },
  ] as const;

  it.each(demoCases)("STORYLINE=demo tick $tick → $agent $kind", async ({ tick, agent, kind }) => {
    const ledger = new MemoryLedger();
    await runTicks(ledger, testConfig(), tick);
    const actions = await actionsAtTick(ledger, tick);
    expect(actions.some((a) => a.agent === agent && a.kind === kind)).toBe(true);
  });

  it("STORYLINE=free does not force scripted loan/default/rate/repay", async () => {
    const ledger = new MemoryLedger();
    await runTicks(ledger, testConfig({ STORYLINE: "free" }), 11);
    const kinds = new Set((await ledger.listActions()).map((a) => a.kind));
    for (const kind of ["request_loan", "mark_default", "set_rate", "repay"] as const) {
      expect(kinds.has(kind)).toBe(false);
    }
  });

  it("patchDemoWorld leaves free mode untouched via onTick (no patch export for free)", () => {
    const base = emptyWorld(4);
    const patched = patchDemoWorld(base, 4, "borrow");
    expect(patched.inventory.bo).toBe(1);
    expect(patched.loans.some((l) => l.borrower === "fay")).toBe(true);
  });
});
