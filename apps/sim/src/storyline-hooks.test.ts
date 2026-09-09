// Demo storyline scheduler — PRD §12 script actions at ticks 1,4,7,9,10.
import { rosterEntry } from "@agent-town/shared";
import { describe, expect, it } from "vitest";
import { parseSimConfig } from "./config.js";
import { decide } from "./decide.js";
import { runTicks } from "./engine.js";
import { MemoryLedger } from "./ledger/index.js";
import { patchDemoWorld } from "./storyline-hooks.js";
import { emptyWorld, loadWorld } from "./world.js";

const bo = rosterEntry("bo");

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

  it("12-tick demo: boom worker beat, set_rate not spammed, hike flag loan", async () => {
    const ledger = new MemoryLedger();
    await runTicks(ledger, testConfig({ MAX_TICKS: "12" }), 12);
    const actions = await ledger.listActions();

    const boomWork = actions.filter(
      (a) =>
        a.tick >= 1 &&
        a.tick <= 3 &&
        (a.kind === "accept_job" || a.kind === "deliver") &&
        (a.agent === "dee" || a.agent === "eli" || a.agent === "fay"),
    );
    expect(boomWork.length).toBeGreaterThan(0);
    expect(boomWork.some((a) => a.agent === "dee")).toBe(true);

    const setRates = actions.filter((a) => a.agent === "ada" && a.kind === "set_rate");
    expect(setRates.some((a) => a.tick === 9)).toBe(true);
    expect(setRates.filter((a) => a.tick >= 1 && a.tick <= 8)).toHaveLength(0);
    expect(actions.some((a) => a.kind === "deny_loan")).toBe(false);
    expect(actions.some((a) => a.tick === 9 && a.agent === "ada" && a.kind === "approve_loan")).toBe(
      false,
    );
    expect(actions.some((a) => a.tick === 10 && a.agent === "ada" && a.kind === "approve_loan")).toBe(
      false,
    );
  });

  it("patchDemoWorld overlay wins over live poor gus/hal", () => {
    const patched = patchDemoWorld(loadWorld(1, { balances: { gus: "1", hal: "1" } }), 1, "boom");
    expect(patched.balances.gus).toBe("5000000");
    expect(patched.balances.hal).toBe("5000000");
  });

  it("patchDemoWorld boom job J-demo lets dee accept or deliver", () => {
    const t1 = patchDemoWorld(emptyWorld(1), 1, "boom");
    expect(t1.jobs.find((j) => j.id === "J-demo")).toMatchObject({
      client: "bo",
      provider: "dee",
      amountUsdc: "1200000",
      status: "open",
    });
    const t2 = patchDemoWorld(emptyWorld(2), 2, "boom");
    expect(t2.jobs.find((j) => j.id === "J-demo")?.status).toBe("funded");
    expect(t2.assignments).toContainEqual({ jobId: "J-demo", worker: "dee", acceptedAtTick: 1 });
    const t3 = patchDemoWorld(emptyWorld(3), 3, "boom");
    expect(t3.jobs.find((j) => j.id === "J-demo")?.status).toBe("submitted");
    expect(t3.settledPayouts.dee).toBe("1200000");
    expect(
      decide(bo, { tick: 3, phase: "boom", world: t3 }).some(
        (a) => a.kind === "complete_job" && a.jobId === "J-demo",
      ),
    ).toBe(true);
  });

  it("patchDemoWorld aligns baseRateBps except hike tick 9 stays behind", () => {
    const t1 = patchDemoWorld(emptyWorld(1), 1, "boom");
    expect(t1.treasury.baseRateBps).toBe(610);
    const t8 = patchDemoWorld(emptyWorld(8), 8, "default");
    expect(t8.treasury.defaults).toBeGreaterThan(0);
    expect(t8.treasury.baseRateBps).toBe(810);
    const t9 = patchDemoWorld(emptyWorld(9), 9, "hike");
    expect(t9.treasury.baseRateBps).toBe(610);
    const t10 = patchDemoWorld(emptyWorld(10), 10, "hike");
    expect(t10.treasury.baseRateBps).toBe(810);
  });

  it("patchDemoWorld t9–10 pending L-flag eli score 50 (mayor flag, no approve)", () => {
    for (const tick of [9, 10] as const) {
      const w = patchDemoWorld(emptyWorld(tick), tick, "hike");
      const flagged = w.loans.find((l) => l.id === "L-flag");
      expect(flagged).toMatchObject({
        borrower: "eli",
        principalUsdc: "1000000",
        status: "pending",
      });
      expect(w.creditScores.eli).toBe(50);
      expect(w.creditScores.eli! < 60).toBe(true);
    }
  });
});
