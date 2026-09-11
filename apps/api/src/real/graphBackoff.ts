// Studio rate-limit backoff — honor Retry-After / x-ratelimit-reset (M6.6).
// Used when subgraph HTTP 429 would otherwise abort refresh and freeze the ledger cache.

/** Pause when 429 has no Retry-After / x-ratelimit-reset. */
export const DEFAULT_GRAPH_429_BACKOFF_MS = 60_000;

const UNIX_MS_MIN = 1_000_000_000_000;

interface GraphErrorShape {
  message?: string;
  status?: number;
  statusCode?: number;
  response?: {
    status?: number;
    statusCode?: number;
    headers?: Headers | Record<string, string | undefined | null>;
  };
}

function asGraphError(err: unknown): GraphErrorShape | undefined {
  if (!err || typeof err !== "object") return undefined;
  return err as GraphErrorShape;
}

export function graphHttpStatus(err: unknown): number | undefined {
  const e = asGraphError(err);
  const status = e?.response?.status ?? e?.response?.statusCode ?? e?.status ?? e?.statusCode;
  if (typeof status === "number" && Number.isFinite(status)) return status;
  const message = e?.message ?? (err instanceof Error ? err.message : undefined);
  if (typeof message === "string" && /\b429\b/.test(message)) return 429;
  return undefined;
}

function headerValue(
  headers: Headers | Record<string, string | undefined | null> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === "function") {
    const v = (headers as Headers).get(name);
    const trimmed = v?.trim();
    return trimmed ? trimmed : undefined;
  }
  const want = name.toLowerCase();
  for (const [key, raw] of Object.entries(headers as Record<string, string | undefined | null>)) {
    if (key.toLowerCase() !== want || typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function parseRetryAfter(raw: string, now: number): number | undefined {
  if (/^\d+$/.test(raw)) return now + Number(raw) * 1000;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : undefined;
}

function parseRateLimitReset(raw: string): number | undefined {
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    return n >= UNIX_MS_MIN ? n : n * 1000;
  }
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : undefined;
}

/** Absolute time to skip Studio queries; undefined = retry next poll. */
export function retryUntilMs(err: unknown, now = Date.now()): number | undefined {
  const e = asGraphError(err);
  const headers = e?.response?.headers;
  const status = graphHttpStatus(err);
  const remaining = headerValue(headers, "x-ratelimit-remaining");
  const retryAfterRaw = headerValue(headers, "retry-after");
  const resetRaw = headerValue(headers, "x-ratelimit-reset");

  if (retryAfterRaw) {
    const until = parseRetryAfter(retryAfterRaw, now);
    if (until !== undefined && until > now) return until;
  }
  if (resetRaw) {
    const until = parseRateLimitReset(resetRaw);
    if (until !== undefined && until > now) return until;
  }
  if (status === 429 || remaining === "0") return now + DEFAULT_GRAPH_429_BACKOFF_MS;
  return undefined;
}

export function graphBackoffActive(untilMs: number, now = Date.now()): boolean {
  return untilMs > now;
}
