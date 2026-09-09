// Tick engine exit tests — M4.1 cadence plus M4.5 narration rows, no network/chain.
import {
  AGENT_NAMES,
  DEMO_STORYLINE,
  NARRATION_MAX_CHARS,
  ROSTER,
  phaseForTick,
} from "@agent-town/shared";
import { describe, expect, it, vi } from "vitest";
import { parseSimConfig } from "./config.js";
import { phaseForConfig, runSingleTick, runTicks } from "./engine.js";
import { MemoryLedger } from "./ledger/index.js";
import { staticNarration } from "./narrator.js";

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

  it("1 dry tick writes 8 narration rows ≤ 120 chars covering the roster", async () => {
    const ledger = new MemoryLedger();
    await runTicks(ledger, testConfig(), 1);
    const rows = await ledger.listNarration();
    expect(rows).toHaveLength(ROSTER.length);
    expect(new Set(rows.map((r) => r.agent))).toEqual(new Set(AGENT_NAMES));
    for (const row of rows) {
      expect(row.tick).toBe(1);
      expect(row.text.length).toBeGreaterThan(0);
      expect(row.text.length).toBeLessThanOrEqual(NARRATION_MAX_CHARS);
    }
  });

  it("LLM off does not call an injected provider", async () => {
    const complete = vi.fn(async () => "should not run");
    const ledger = new MemoryLedger();
    await runSingleTick(ledger, testConfig({ LLM_NARRATOR: "off" }), {
      narratorProvider: { complete },
    });
    expect(complete).not.toHaveBeenCalled();
    expect(await ledger.listNarration()).toHaveLength(ROSTER.length);
  });

  it("LLM on + provider throw still writes 8 static rows", async () => {
    const complete = vi.fn(async () => {
      throw new Error("nope");
    });
    const ledger = new MemoryLedger();
    await runSingleTick(ledger, testConfig({ LLM_NARRATOR: "on" }), {
      narratorProvider: { complete },
    });
    const rows = await ledger.listNarration();
    expect(rows).toHaveLength(ROSTER.length);
    expect(complete).toHaveBeenCalledTimes(ROSTER.length);
    for (const row of rows) {
      const agent = ROSTER.find((a) => a.name === row.agent);
      expect(agent).toBeDefined();
      if (!agent) continue;
      expect(row.text).toBe(
        staticNarration(agent, { tick: 1, phase: "boom", lastActionKind: "idle" }),
      );
    }
  });

  it("LLM on + 200-char reply stores text ≤ 120", async () => {
    const complete = vi.fn(async () => "x".repeat(200));
    const ledger = new MemoryLedger();
    await runSingleTick(ledger, testConfig({ LLM_NARRATOR: "on" }), {
      narratorProvider: { complete },
    });
    const rows = await ledger.listNarration();
    expect(rows).toHaveLength(ROSTER.length);
    for (const row of rows) {
      expect(row.text.length).toBeLessThanOrEqual(NARRATION_MAX_CHARS);
      expect(row.text).toBe("x".repeat(NARRATION_MAX_CHARS));
    }
  });

  it("re-inserting the same tick/agent narration is skipped", async () => {
    const ledger = new MemoryLedger();
    await runSingleTick(ledger, testConfig({ MAX_TICKS: "1" }));
    const first = await ledger.listNarration();
    const dup = await ledger.insertNarration({
      tick: 1,
      agent: "ada",
      text: "duplicate should not land",
    });
    expect(dup).toBe(false);
    expect(await ledger.listNarration()).toHaveLength(first.length);
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
