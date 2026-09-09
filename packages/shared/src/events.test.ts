// SSE union must discriminate on `event`, narrow types correctly, and reject
// mismatched name/payload pairs or unknown event names.
import { describe, expect, it } from "vitest";
import { NARRATION_MAX_CHARS, SSE_EVENTS, SseEventSchema, parseSseEvent } from "./events.js";
import { FIXTURES } from "./fixtures.js";

describe("SSE events", () => {
  it("exposes the five frozen event names", () => {
    expect(SSE_EVENTS).toEqual(["tick", "tx", "narration", "loan_flagged", "scoreboard"]);
  });

  it("discriminates each fixture by `event`", () => {
    for (const ev of FIXTURES.sseEvents) {
      const parsed = parseSseEvent(ev.event, ev.data);
      expect(parsed.event).toBe(ev.event);
      if (parsed.event === "tick") expect(parsed.data.phase).toBe("default");
      if (parsed.event === "tx") expect(parsed.data.status).toBe("complete");
      if (parsed.event === "loan_flagged") expect(parsed.data.id).toBe("L-2");
      if (parsed.event === "scoreboard") expect(parsed.data.signals.stale).toBe(false);
    }
  });

  it("rejects a payload under the wrong event name", () => {
    const res = SseEventSchema.safeParse({ event: "tick", data: FIXTURES.txResponse });
    expect(res.success).toBe(false);
  });

  it("rejects unknown event names", () => {
    expect(SseEventSchema.safeParse({ event: "boom", data: {} }).success).toBe(false);
  });

  it("caps narration at 120 chars", () => {
    const long = { tick: 1, agent: "ada", text: "x".repeat(NARRATION_MAX_CHARS + 1) };
    expect(SseEventSchema.safeParse({ event: "narration", data: long }).success).toBe(false);
  });
});
