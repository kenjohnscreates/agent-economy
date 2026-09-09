// Live stream client for GET /events. One EventSource, one listener per event
// name, each frame validated with the shared schema before it reaches the reducer.
import { SSE_EVENTS, parseSseEvent, type SseEvent } from "@agent-town/shared";
import type { StreamStatus } from "./store";

export interface StreamHandle {
  close(): void;
}

export function openTownStream(
  url: string,
  onEvent: (e: SseEvent) => void,
  onStatus: (s: StreamStatus) => void,
): StreamHandle {
  const es = new EventSource(url);
  onStatus("connecting");
  es.onopen = () => onStatus("live");
  // EventSource reconnects on its own; surface the gap so the badge can show it.
  es.onerror = () => onStatus(es.readyState === EventSource.CLOSED ? "error" : "reconnecting");
  for (const name of SSE_EVENTS) {
    es.addEventListener(name, (ev) => {
      try {
        onEvent(parseSseEvent(name, JSON.parse((ev as MessageEvent).data)));
      } catch (err) {
        console.warn(`[sse] dropped ${name} frame`, err);
      }
    });
  }
  return { close: () => es.close() };
}
