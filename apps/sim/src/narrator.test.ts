// Narrator unit tests — static path, injected fake provider, timeout/error fallback.
import { LLM_TIMEOUT_MS, NARRATION_MAX_CHARS, rosterEntry } from "@agent-town/shared";
import { describe, expect, it, vi } from "vitest";
import { narrate, staticNarration, type LlmProvider, type NarrateContext } from "./narrator.js";

const ada = rosterEntry("ada");
const ctx: NarrateContext = { tick: 1, phase: "boom", lastActionKind: "idle" };

describe("narrate", () => {
  it("LLM off returns a clipped static persona line and never calls the provider", async () => {
    const complete = vi.fn(async () => "should not run");
    const text = await narrate(ada, ctx, { llmNarrator: false }, { complete });
    expect(complete).not.toHaveBeenCalled();
    expect(text).toBe(staticNarration(ada, ctx));
    expect(text.length).toBeGreaterThan(0);
    expect(text.length).toBeLessThanOrEqual(NARRATION_MAX_CHARS);
    expect(text).toContain("ada");
    expect(text).toContain("boom");
    expect(text).toContain("idle");
  });

  it("LLM on + provider throw falls back to static", async () => {
    const complete = vi.fn(async () => {
      throw new Error("provider down");
    });
    const text = await narrate(ada, ctx, { llmNarrator: true }, { complete });
    expect(complete).toHaveBeenCalledOnce();
    expect(text).toBe(staticNarration(ada, ctx));
  });

  it(`LLM on + timeout (< ${LLM_TIMEOUT_MS}ms budget in prod) falls back to static`, async () => {
    const complete = vi.fn((_prompt: string, signal: AbortSignal) => {
      return new Promise<string>((_, reject) => {
        const onAbort = () => reject(new Error("aborted"));
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      });
    });
    const provider: LlmProvider = { complete };
    const text = await narrate(ada, ctx, { llmNarrator: true }, provider, 30);
    expect(LLM_TIMEOUT_MS).toBeGreaterThanOrEqual(8000);
    expect(complete).toHaveBeenCalledOnce();
    expect(text).toBe(staticNarration(ada, ctx));
  });

  it("LLM on + 200-char reply is stored clipped to 120", async () => {
    const complete = vi.fn(async () => "x".repeat(200));
    const text = await narrate(ada, ctx, { llmNarrator: true }, { complete });
    expect(text).toBe("x".repeat(NARRATION_MAX_CHARS));
    expect(text.length).toBe(NARRATION_MAX_CHARS);
  });

  it("LLM on + empty reply falls back to static", async () => {
    const complete = vi.fn(async () => "   ");
    const text = await narrate(ada, ctx, { llmNarrator: true }, { complete });
    expect(text).toBe(staticNarration(ada, ctx));
  });
});
