// GET /events — Server-Sent Events per `SseEventSchema` (ARCHITECTURE §6.3).
// Frame format: `event: <name>\ndata: <json>\n\n`. On connect the client gets
// the current `tick` + `scoreboard`, then live events from the data source.
// Input: a `DataSource`. Output: a Hono handler.
import { SseEventSchema, type SseEvent } from "@agent-town/shared";
import type { Handler } from "hono";
import { streamSSE } from "hono/streaming";
import type { DataSource } from "./source.js";

const HEARTBEAT_MS = 15_000;

export function sseRoute(source: DataSource): Handler {
  return (c) =>
    streamSSE(c, async (stream) => {
      let frameId = 0;
      const send = async (event: SseEvent): Promise<void> => {
        const parsed = SseEventSchema.parse(event); // contract check before the wire
        await stream.writeSSE({
          event: parsed.event,
          data: JSON.stringify(parsed.data),
          id: String(++frameId),
        });
      };

      // Buffer events so writes never interleave mid-frame.
      let queue: Promise<void> = Promise.resolve();
      const enqueue = (event: SseEvent): void => {
        queue = queue.then(() => send(event)).catch((err: unknown) => {
          console.error("[sse] write failed:", err);
        });
      };

      const state = source.getState();
      enqueue({ event: "tick", data: { tick: state.tick, phase: state.phase } });
      enqueue({ event: "scoreboard", data: source.getScoreboard() });

      const unsubscribe = source.subscribe(enqueue);
      const heartbeat = setInterval(() => {
        queue = queue.then(async () => {
          await stream.write(`: heartbeat ${new Date().toISOString()}\n\n`);
        });
      }, HEARTBEAT_MS);

      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          clearInterval(heartbeat);
          unsubscribe();
          resolve();
        });
      });
    });
}
