// Tick engine exit tests — proves M4.1 acceptance criteria without network/chain.
import { DEMO_STORYLINE, phaseForTick } from "@agent-town/shared";
import { describe, expect, it } from "vitest";
import { parseSimConfig } from "./config.js";
import { phaseForConfig, runSingleTick, runTicks } from "./engine.js";
import { MemoryLedger } from "./ledger/index.js";

function testConfig(overrides: Record<string, string> = {}) {
  return parseSimConfig({
    TICK_MS: "100",
    MAX_TICKS: "50",
    STORYLINE: "demo",
    ...overrides,
  });
}

describe("runTicks", () => {
  it("--once advances exactly one tick", async () => {
    const ledger = new MemoryLedger();
    const config = testConfig({ MAX_TICKS: "50" });
    const after = await runTicks(ledger, config, 1);
    expect(after).toBe(1);
    const ticks = await ledger.listTicks();
    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.id).toBe(1);
  });

  it("5 dry ticks produce sequential ids 1–5", async () => {
    const ledger = new MemoryLedger();
    const config = testConfig();
    await runTicks(ledger, config, 5);
    const ticks = await ledger.listTicks();
    expect(ticks).toHaveLength(5);
    expect(ticks.map((t) => t.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("MAX_TICKS=3 stops runTicks(10) at tick 3", async () => {
    const ledger = new MemoryLedger();
    const config = testConfig({ MAX_TICKS: "3" });
    const after = await runTicks(ledger, config, 10);
    expect(after).toBe(3);
    expect(await ledger.listTicks()).toHaveLength(3);
  });

  it("re-running the same tick/agent/kind does not duplicate actions", async () => {
    const ledger = new MemoryLedger();
    const config = testConfig({ MAX_TICKS: "1" });
    await runSingleTick(ledger, config);
    const first = await ledger.listActions();
    const dup = await ledger.insertAction({
      tick: 1,
      agent: "ada",
      kind: "idle",
      tx: null,
      status: "skipped",
    });
    expect(dup).toBe(false);
    expect(await ledger.listActions()).toHaveLength(first.length);
  });

  it("demo phases for ticks 1,4,6,9,11 match DEMO_STORYLINE", async () => {
    const ledger = new MemoryLedger();
    const config = testConfig();
    await runTicks(ledger, config, 11);
    const ticks = await ledger.listTicks();
    for (const id of [1, 4, 6, 9, 11]) {
      const row = ticks.find((t) => t.id === id);
      expect(row?.phase).toBe(DEMO_STORYLINE[id]);
      expect(row?.phase).toBe(phaseForTick(id));
    }
  });

  it("free storyline uses constant boom phase", () => {
    expect(phaseForConfig(6, "free")).toBe("boom");
    expect(phaseForConfig(99, "free")).toBe("boom");
  });
});

describe("parseSimConfig", () => {
  it("LLM flags default off; external signals default on", () => {
    const config = parseSimConfig({});
    expect(config.flags.llmAdvisor).toBe(false);
    expect(config.flags.llmNarrator).toBe(false);
    expect(config.flags.externalSignals).toBe(true);
    expect(config.flags.storyline).toBe("demo");
  });
});
