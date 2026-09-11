// Connection helpers for the live API (M5.8). Pure functions, unit-tested.
// The real source answers 501 NOT_IMPLEMENTED while its cache warms; that is a
// "try again shortly", not a failure, and the UI says so.
import { ApiRequestError } from "./api";

/** True when the API said "not ready yet" rather than "no". */
export function isWarming(err: unknown): boolean {
  return err instanceof ApiRequestError && err.status === 501;
}

/** True when the browser could not reach the API at all (fetch threw, no HTTP status). */
export function isUnreachable(err: unknown): boolean {
  return !(err instanceof ApiRequestError) && err instanceof Error;
}

export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_CAP_MS = 8000;

/** 1s, 2s, 4s, 8s, 8s, ... for attempt 1, 2, 3, 4, 5, ... */
export function backoffMs(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt));
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (n - 1));
}

export type ConnectPhase =
  | "warming"
  | "unreachable"
  | "failed"
  | "stream-dropped"
  | "stream-closed";

/** What to tell the mayor while the snapshot keeps failing. */
export function describeConnect(
  err: unknown,
  apiUrl: string,
): { phase: ConnectPhase; text: string } {
  if (isWarming(err)) {
    return {
      phase: "warming",
      text: "The town API is up but its real data source is still warming (subgraph, ENS, balances). Retrying.",
    };
  }
  if (isUnreachable(err)) {
    return {
      phase: "unreachable",
      text: `Cannot reach the town API at ${apiUrl}. Start it with the mock or real command below, or switch to replay.`,
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return { phase: "failed", text: `The town API answered with an error: ${msg}` };
}

/**
 * The two live-stream statuses that mean frames have stopped arriving.
 * "reconnecting" is the browser still retrying by itself; "error" is a closed stream.
 */
export type StreamDrop = "reconnecting" | "error";

/**
 * What to tell the mayor when the stream drops under a page that is already live.
 * Different from describeConnect: there is a town on screen, it is just frozen at the
 * last frame we received, so the wording says that rather than "cannot reach the API".
 */
export function describeStreamDrop(
  status: StreamDrop,
  apiUrl: string,
): { phase: ConnectPhase; text: string } {
  if (status === "reconnecting") {
    return {
      phase: "stream-dropped",
      text: `The live stream from ${apiUrl} stopped sending. The town below is the last state that arrived, and the browser is already retrying on its own. Retry now to reload the snapshot and reattach, or switch to replay.`,
    };
  }
  return {
    phase: "stream-closed",
    text: `The live stream from ${apiUrl} closed and the browser has given up retrying. The town below is the last state that arrived. Retry now to reload the snapshot and reattach, or switch to replay.`,
  };
}
