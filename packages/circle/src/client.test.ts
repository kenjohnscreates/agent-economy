import { describe, expect, it } from "vitest";
import { createCircleClient, parseCircleEnv } from "./client.js";

const SECRET = "ab".repeat(32);

describe("parseCircleEnv", () => {
  it("parses and defaults the wallet set name", () => {
    const e = parseCircleEnv({ CIRCLE_API_KEY: "TEST_API_KEY:x:y", CIRCLE_ENTITY_SECRET: SECRET });
    expect(e.CIRCLE_WALLET_SET_NAME).toBe("agent-town");
    expect(e.CIRCLE_WALLET_SET_ID).toBeUndefined();
  });

  it("names missing vars without echoing values", () => {
    const bad = "not-hex-secret-value-1234";
    const err = (() => {
      try {
        parseCircleEnv({ CIRCLE_API_KEY: "", CIRCLE_ENTITY_SECRET: bad });
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err?.message).toMatch(/CIRCLE_API_KEY/);
    expect(err?.message).toMatch(/CIRCLE_ENTITY_SECRET/);
    expect(err?.message).not.toContain(bad);
  });

  it("createCircleClient builds an SDK client offline (no network call at construction)", () => {
    const c = createCircleClient({
      CIRCLE_API_KEY: "TEST_API_KEY:x:y",
      CIRCLE_ENTITY_SECRET: SECRET,
    });
    expect(typeof c.createWallets).toBe("function");
    expect(typeof c.getTransaction).toBe("function");
  });
});
