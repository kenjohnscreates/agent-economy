// Skipped/--once never invoke ENS writes (M4.6 hook).
import { describe, expect, it, vi } from "vitest";
import { maybeApplyEnsSideEffects } from "./ens-side-effects.js";

describe("maybeApplyEnsSideEffects", () => {
  it("does not call apply when status is skipped", async () => {
    const apply = vi.fn();
    await maybeApplyEnsSideEffects(
      { agent: "fay", kind: "mark_default", tick: 7, status: "skipped" },
      apply,
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("does not call apply when no hook is injected", async () => {
    await expect(
      maybeApplyEnsSideEffects({ agent: "bo", kind: "repay", tick: 5, status: "complete" }),
    ).resolves.toBeUndefined();
  });

  it("forwards complete repay/default to the injected hook", async () => {
    const apply = vi.fn(async () => {});
    const event = { agent: "bo" as const, kind: "repay" as const, tick: 5, status: "complete" as const };
    await maybeApplyEnsSideEffects(event, apply);
    expect(apply).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledWith(event);
  });
});
