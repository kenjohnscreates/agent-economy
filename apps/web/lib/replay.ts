// Replay client: plays a recorded stream (scripts/record.ts output) with the same
// callback shape as the live client, plus pause / speed / seek. Frames carry a
// millisecond offset from the start of the recording; "agents" frames are the
// per-tick /agents snapshots so positions and balances move without a backend.
import { z } from "zod";
import { AgentsResponseSchema, SseEventSchema } from "@agent-town/shared";
import type { TownAction } from "./store";

export const ReplayFrameSchema = z.union([
  z.object({ t: z.number().nonnegative(), event: z.literal("agents"), data: AgentsResponseSchema }),
  z.object({ t: z.number().nonnegative() }).and(SseEventSchema),
]);
export const ReplayFileSchema = z.object({
  version: z.literal(1),
  recordedAt: z.string(),
  source: z.string(),
  mockTickMs: z.number().positive(),
  frames: z.array(ReplayFrameSchema),
});
export type ReplayFile = z.infer<typeof ReplayFileSchema>;

export interface ReplayControls {
  pause(): void;
  resume(): void;
  setSpeed(x: number): void;
  /** Jump to the first frame at or after the given tick. */
  seekTick(tick: number): void;
  close(): void;
  readonly playing: boolean;
}

export function openReplay(
  file: ReplayFile,
  onAction: (a: TownAction) => void,
  opts: { speed?: number; loop?: boolean } = {},
): ReplayControls {
  const frames = file.frames;
  let speed = opts.speed ?? 1;
  const loop = opts.loop ?? true;
  let i = 0;
  let playing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const emit = (idx: number) => {
    const f = frames[idx];
    if (!f) return;
    onAction(f as TownAction);
  };

  const schedule = () => {
    if (closed || !playing) return;
    if (i >= frames.length) {
      if (!loop) {
        playing = false;
        return;
      }
      i = 0;
    }
    const cur = frames[i]!;
    const prevT = i === 0 ? cur.t : frames[i - 1]!.t;
    const wait = Math.max(0, (cur.t - prevT) / speed);
    timer = setTimeout(() => {
      emit(i);
      i += 1;
      schedule();
    }, wait);
  };

  const controls: ReplayControls = {
    get playing() {
      return playing;
    },
    pause() {
      playing = false;
      if (timer) clearTimeout(timer);
    },
    resume() {
      if (playing || closed) return;
      playing = true;
      schedule();
    },
    setSpeed(x) {
      speed = Math.max(0.25, x);
    },
    seekTick(tick) {
      const idx = frames.findIndex((f) => f.event === "tick" && f.data.tick >= tick);
      i = idx < 0 ? 0 : idx;
      // Emit the latest agents snapshot before that point so the screen is consistent.
      for (let k = i; k >= 0; k--) {
        const f = frames[k];
        if (f && f.event === "agents") {
          emit(k);
          break;
        }
      }
    },
    close() {
      closed = true;
      playing = false;
      if (timer) clearTimeout(timer);
    },
  };
  controls.resume();
  return controls;
}
