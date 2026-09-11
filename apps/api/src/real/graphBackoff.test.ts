import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRAPH_429_BACKOFF_MS,
  graphBackoffActive,
  graphHttpStatus,
  retryUntilMs,
} from "./graphBackoff.js";

const NOW = Date.parse("2026-09-11T15:00:00.000-04:00");

function httpErr(status: number, headers: Record<string, string> = {}): Error {
  return Object.assign(new Error(`GraphQL Error (${status})`), {
    response: { status, headers: new Headers(headers) },
  });
}

describe("retryUntilMs", () => {
  it("honors Retry-After seconds", () => {
    const until = retryUntilMs(httpErr(429, { "retry-after": "120" }), NOW);
    expect(until).toBe(NOW + 120_000);
  });

  it("honors Retry-After HTTP-date", () => {
    const until = retryUntilMs(
      httpErr(429, { "retry-after": "Fri, 11 Sep 2026 19:22:00 GMT" }),
      NOW,
    );
    expect(until).toBe(Date.parse("2026-09-11T19:22:00.000Z"));
  });

  it("honors x-ratelimit-reset unix seconds when remaining=0", () => {
    const resetSec = Math.floor(NOW / 1000) + 3_600;
    const until = retryUntilMs(
      httpErr(429, {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(resetSec),
      }),
      NOW,
    );
    expect(until).toBe(resetSec * 1000);
  });

  it("defaults 60s on 429 without headers", () => {
    expect(retryUntilMs(httpErr(429), NOW)).toBe(NOW + DEFAULT_GRAPH_429_BACKOFF_MS);
  });

  it("ignores non-429 without retry headers", () => {
    expect(retryUntilMs(httpErr(500), NOW)).toBeUndefined();
  });
});

describe("graphHttpStatus / graphBackoffActive", () => {
  it("reads 429 from message when status missing", () => {
    expect(graphHttpStatus(new Error("Too Many Requests (429)"))).toBe(429);
  });

  it("is active only before untilMs", () => {
    expect(graphBackoffActive(NOW + 1, NOW)).toBe(true);
    expect(graphBackoffActive(NOW, NOW)).toBe(false);
  });
});
