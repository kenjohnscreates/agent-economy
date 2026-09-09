import { describe, expect, it } from "vitest";
import { createGraphClient, subgraphHeaders, subgraphUrlFromEnv } from "./client.js";

describe("subgraphHeaders", () => {
  it("adds Authorization when api key present", () => {
    const headers = subgraphHeaders("abc123");
    expect(headers.Authorization).toBe("Bearer abc123");
    expect(headers["User-Agent"]).toMatch(/Mozilla/);
  });

  it("omits Authorization without key", () => {
    const headers = subgraphHeaders();
    expect(headers.Authorization).toBeUndefined();
  });
});

describe("subgraphUrlFromEnv", () => {
  it("throws when SUBGRAPH_URL missing", () => {
    expect(() => subgraphUrlFromEnv({})).toThrow(/SUBGRAPH_URL/);
  });
});

describe("createGraphClient", () => {
  it("builds client from explicit config", () => {
    const client = createGraphClient({
      url: "https://example.com/graphql",
      apiKey: "test-key",
    });
    expect(client).toBeDefined();
  });
});
