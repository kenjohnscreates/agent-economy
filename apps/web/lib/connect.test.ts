import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./api";
import { backoffMs, describeConnect, isUnreachable, isWarming } from "./connect";

describe("connect helpers", () => {
  it("treats 501 as warming, thrown fetches as unreachable, other statuses as failures", () => {
    const warming = new ApiRequestError(501, "NOT_IMPLEMENTED", "real source not ready yet");
    const down = new TypeError("Failed to fetch");
    const bad = new ApiRequestError(500, "INTERNAL", "internal error");
    expect(isWarming(warming)).toBe(true);
    expect(isWarming(down)).toBe(false);
    expect(isUnreachable(down)).toBe(true);
    expect(isUnreachable(warming)).toBe(false);
    expect(describeConnect(warming, "http://x").phase).toBe("warming");
    expect(describeConnect(down, "http://x").phase).toBe("unreachable");
    expect(describeConnect(down, "http://x").text).toContain("http://x");
    expect(describeConnect(bad, "http://x")).toEqual({
      phase: "failed",
      text: "The town API answered with an error: internal error",
    });
  });
  it("backs off 1s, 2s, 4s, 8s and then holds at 8s", () => {
    expect([1, 2, 3, 4, 5, 9].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
    expect(backoffMs(0)).toBe(1000);
  });
});
