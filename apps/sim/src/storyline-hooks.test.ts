// Demo storyline scheduler — PRD §12 script actions at ticks 1,4,7,9,10.
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
    { tick: 9, agent: "bo", kind: "repay" as const },
  ] as const;

  it.each(demoCases)("STORYLINE=demo tick $tick → $agent $kind", async ({ tick, agent, kind }) => {
    const ledger = new MemoryLedger();
    await runTicks(ledger, testConfig(), tick);
    const actions = await actionsAtTick(ledger, tick);
    expect(actions.some((a) => a.agent === agent && a.kind === kind)).toBe(true);
  });

  it("12-tick demo emits mark_default once (ada) and repay once (bo)", async () => {
    const ledger = new MemoryLedger();
    await runTicks(ledger, testConfig({ MAX_TICKS: "12" }), 12);
    const actions = await ledger.listActions();
    const markDefaults = actions.filter((a) => a.agent === "ada" && a.kind === "mark_default");
    const repays = actions.filter((a) => a.agent === "bo" && a.kind === "repay");
    expect(markDefaults).toHaveLength(1);
    expect(markDefaults[0]?.tick).toBe(7);
    expect(repays).toHaveLength(1);
    expect(repays[0]?.tick).toBeLessThanOrEqual(9);
  });

  it("STORYLINE=free does not force scripted loan/default/rate/repay", async () => {
    const ledger = new MemoryLedger();
    await runTicks(ledger, testConfig({ STORYLINE: "free" }), 11);
    const kinds = new Set((await ledger.listActions()).map((a) => a.kind));
    for (const kind of ["request_loan", "mark_default", "set_rate", "repay"] as const) {
      expect(kinds.has(kind)).toBe(false);
    }
  });

  it("patchDemoWorld marks fay defaulted from tick 8", () => {
    const t7 = patchDemoWorld(emptyWorld(7), 7, "default");
    expect(t7.loans.find((l) => l.borrower === "fay")?.status).toBe("approved");
    const t8 = patchDemoWorld(emptyWorld(8), 8, "default");
    expect(t8.loans.find((l) => l.borrower === "fay")?.status).toBe("defaulted");
  });

  it("patchDemoWorld drops approved bo loan from tick 10", () => {
    const t10 = patchDemoWorld(emptyWorld(10), 10, "hike");
    expect(t10.loans.some((l) => l.borrower === "bo" && l.status === "approved")).toBe(false);
  });
});
