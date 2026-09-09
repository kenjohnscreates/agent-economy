// Roster shape guards (PRD §3): 8 unique names, role counts 1/2/3/2, ENS helper.
import { describe, expect, it } from "vitest";
import { DEMO_STORYLINE, phaseForTick } from "./storyline.js";
import { ROSTER, RosterEntrySchema, TOWN_NAME_PLACEHOLDER, ensNameFor } from "./roster.js";

describe("ROSTER", () => {
  it("has exactly 8 agents with unique names", () => {
    expect(ROSTER).toHaveLength(8);
    expect(new Set(ROSTER.map((r) => r.name)).size).toBe(8);
  });

  it("role counts are treasurer 1 / merchant 2 / worker 3 / consumer 2", () => {
    const count = (role: string) => ROSTER.filter((r) => r.role === role).length;
    expect(count("treasurer")).toBe(1);
    expect(count("merchant")).toBe(2);
    expect(count("worker")).toBe(3);
    expect(count("consumer")).toBe(2);
  });

  it("every entry parses and points at /sprites/<name>.png", () => {
    for (const r of ROSTER) {
      expect(RosterEntrySchema.parse(r)).toEqual(r);
      expect(r.avatar).toBe(`/sprites/${r.name}.png`);
    }
  });
});

describe("ensNameFor", () => {
  it("builds <label>.<town>.eth without hardcoding a town", () => {
    expect(ensNameFor("ada", TOWN_NAME_PLACEHOLDER)).toBe("ada.<town>.eth");
    expect(ensNameFor("ada", "sometown")).toBe("ada.sometown.eth");
    expect(ensNameFor("ada", "sometown.eth")).toBe("ada.sometown.eth");
  });
});

describe("DEMO_STORYLINE", () => {
  it("matches PRD §12 phases per tick", () => {
    expect([1, 2, 3].map(phaseForTick)).toEqual(["boom", "boom", "boom"]);
    expect([4, 5].map(phaseForTick)).toEqual(["borrow", "borrow"]);
    expect([6, 7, 8].map(phaseForTick)).toEqual(["default", "default", "default"]);
    expect([9, 10].map(phaseForTick)).toEqual(["hike", "hike"]);
    expect([11, 12].map(phaseForTick)).toEqual(["recover", "recover"]);
    expect(Object.keys(DEMO_STORYLINE)).toHaveLength(12);
    expect(phaseForTick(99)).toBe("recover");
  });
});
