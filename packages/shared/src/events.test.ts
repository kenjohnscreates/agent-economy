// SSE union must discriminate on `event`, narrow types correctly, and reject
// mismatched name/payload pairs or unknown event names.
import { describe, expect, it } from "vitest";
import { SSE_EVENTS, SseEventSchema, TxEventSchema, parseSseEvent } from "./events.js";
import { FIXTURES } from "./fixtures.js";
import { NARRATION_MAX_CHARS } from "./rules.js";

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

  it("tx event carries amountUsdc + counterparty (nullable, USDC as string)", () => {
    expect(FIXTURES.sseEvents[1]?.event).toBe("tx");
    const ok = TxEventSchema.parse({
      ...FIXTURES.txEvent,
      amountUsdc: null,
      counterparty: "treasury",
    });
    expect(ok.amountUsdc).toBeNull();
    expect(TxEventSchema.safeParse({ ...FIXTURES.txEvent, amountUsdc: 1 }).success).toBe(false);
    expect(TxEventSchema.safeParse({ ...FIXTURES.txEvent, counterparty: "" }).success).toBe(false);
  });

  it("caps narration at 120 chars", () => {
    const long = { tick: 1, agent: "ada", text: "x".repeat(NARRATION_MAX_CHARS + 1) };
    expect(SseEventSchema.safeParse({ event: "narration", data: long }).success).toBe(false);
  });
});
