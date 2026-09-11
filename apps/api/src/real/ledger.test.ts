// latestByTick — pick the highest-tick row per agent from a list fetch.
import { describe, expect, it } from "vitest";
import { latestByTick } from "./ledger.js";

describe("latestByTick", () => {
  it("returns undefined for empty / other agents", () => {
    expect(latestByTick([], "bo")).toBeUndefined();
    expect(latestByTick([{ agent: "cy", tick: 2 }], "bo")).toBeUndefined();
  });

  it("picks the highest tick for that agent", () => {
    const rows = [
      { agent: "bo", tick: 1, text: "a" },
      { agent: "bo", tick: 3, text: "c" },
      { agent: "bo", tick: 2, text: "b" },
      { agent: "cy", tick: 9, text: "x" },
    ];
    expect(latestByTick(rows, "bo")).toEqual({ agent: "bo", tick: 3, text: "c" });
  });
});
