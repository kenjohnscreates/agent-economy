// Prop-driven agent animation. Positions remain in the frozen native frame.
// The scene reads these mutable controllers; only prop updates build routes.
// Re-targeting on a bridge finishes its current route before taking the next one.
import type { AgentSummary } from "@agent-town/shared";
import { makePath, route, samplePath, type Path, type Point } from "./paths";

export class AgentMotion implements Point {
  x: number;
  y: number;
  data: AgentSummary;
  path: Path;
  progress = 750;
  elapsed = 0;
  speechUntil = 0;
  emoteUntil = 0;
  defaultUntilTick = -1;
  frame = "idle_0";
  private decisionTick = -1;
  private workUntil = 0;

  constructor(data: AgentSummary, point: Point) {
    this.data = data;
    this.x = point.x;
    this.y = point.y;
    this.path = makePath([{ ...point }, { ...point }]);
    if (data.narration) {
      this.speechUntil = 3000;
      this.emoteUntil = 1200;
    }
  }
  approach(): Point[] {
    const start = { x: this.x, y: this.y };
    if (this.progress >= 750 || this.path.points.length <= 2) return [start];
    const distance = (1 - (1 - this.progress / 750) ** 3) * this.path.total;
    const index = this.path.lengths.findIndex((length) => length >= distance);
    return [start, ...this.path.points.slice(Math.max(1, index + 1))];
  }
  set(data: AgentSummary, target: Point, reduced: boolean): void {
    const prev = this.data.position;
    const changed =
      prev.building !== data.position.building ||
      prev.x !== data.position.x ||
      prev.y !== data.position.y;
    if (changed) {
      const oldEnd = this.path.points[this.path.points.length - 1]!;
      const next = route(this.data.position.building, this, data.position.building, target);
      if (this.progress < 750 && this.path.points.length > 2) {
        const t = 1 - (1 - this.progress / 750) ** 3;
        const index = this.path.lengths.findIndex((n) => n >= t * this.path.total);
        const tail = this.path.points.slice(Math.max(1, index + 1));
        const after = route(this.data.position.building, oldEnd, data.position.building, target);
        this.path = makePath([{ x: this.x, y: this.y }, ...tail, ...after.points.slice(1)]);
      } else this.path = next;
      this.progress = 0;
    }
    if (data.narration !== this.data.narration) {
      this.speechUntil = data.narration ? this.elapsed + 3000 : 0;
      this.emoteUntil = data.narration ? this.elapsed + 1200 : 0;
    }
    if (data.lastDecision && data.lastDecision.tick !== this.decisionTick) {
      this.decisionTick = data.lastDecision.tick;
      this.workUntil = data.lastDecision.kind === "idle" ? 0 : this.elapsed + 1600;
    }
    this.data = data;
    if (reduced) {
      this.x = target.x;
      this.y = target.y;
      this.progress = 750;
    }
  }
  update(ms: number, tick: number, reduced: boolean): void {
    this.elapsed += ms;
    if (this.progress < 750) {
      this.progress = Math.min(750, this.progress + ms);
      samplePath(this.path, 1 - (1 - this.progress / 750) ** 3, this);
    }
    // Frame names are interned constants, never concatenated in the hot loop.
    const f = Math.floor(this.elapsed / 100);
    if (tick < this.defaultUntilTick) this.frame = "emote_1";
    else if (this.elapsed < this.emoteUntil) this.frame = EMOTE[f % 2]!;
    else if (reduced) this.frame = "idle_0";
    else if (this.progress < 750) this.frame = WALK[f % 4]!;
    else if (this.elapsed < this.workUntil) this.frame = WORK[f % 4]!;
    else this.frame = IDLE[f % 3]!;
  }
}
const IDLE = ["idle_0", "idle_1", "idle_2"];
const WALK = ["walk_0", "walk_1", "walk_2", "walk_3"];
const WORK = ["work_0", "work_1", "work_2", "work_3"];
const EMOTE = ["emote_0", "emote_1"];
