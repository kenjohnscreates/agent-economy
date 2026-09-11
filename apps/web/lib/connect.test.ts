import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./api";
import {
  backoffMs,
  describeConnect,
  describeStreamDrop,
  isUnreachable,
  isWarming,
} from "./connect";

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
  it("separates a stream still retrying from a stream that has closed", () => {
    expect(describeStreamDrop("reconnecting", "http://x").phase).toBe("stream-dropped");
    expect(describeStreamDrop("error", "http://x").phase).toBe("stream-closed");
    expect(describeStreamDrop("reconnecting", "http://x").text).toContain("retrying on its own");
    expect(describeStreamDrop("error", "http://x").text).toContain("given up retrying");
  });
  it("names the api url and the surviving town in both stream-drop messages", () => {
    for (const status of ["reconnecting", "error"] as const) {
      const { text } = describeStreamDrop(status, "http://localhost:3001");
      expect(text).toContain("http://localhost:3001");
      expect(text).toContain("The town below is the last state that arrived");
      expect(text).toContain("switch to replay");
    }
  });
  it("does not reuse the cold-start wording for a dropped stream", () => {
    const cold = describeConnect(new TypeError("Failed to fetch"), "http://x").text;
    for (const status of ["reconnecting", "error"] as const) {
      const warm = describeStreamDrop(status, "http://x").text;
      expect(warm).not.toEqual(cold);
      expect(warm).not.toContain("Cannot reach the town API");
    }
  });
});
