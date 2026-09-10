// The bridge geometry is shared by terrain, agent movement and payments.
// Routes preserve authoritative endpoints and precompute segment lengths.
// Sampling mutates a caller-owned point so animation creates no garbage.
import type { Building } from "@agent-town/shared";

export interface Point {
  x: number;
  y: number;
}
export interface Path {
  points: Point[];
  lengths: number[];
  total: number;
}
export const BRIDGES: { from: Building; to: Building; points: Point[]; width: number }[] = [
  {
    from: "bank",
    to: "market",
    points: [
      { x: 256, y: 118 },
      { x: 215, y: 144 },
      { x: 186, y: 172 },
    ],
    width: 18,
  },
  {
    from: "bank",
    to: "workshop",
    points: [
      { x: 384, y: 118 },
      { x: 425, y: 144 },
      { x: 454, y: 172 },
    ],
    width: 12,
  },
  {
    from: "market",
    to: "homes",
    points: [
      { x: 188, y: 258 },
      { x: 218, y: 282 },
      { x: 258, y: 305 },
    ],
    width: 16,
  },
  {
    from: "workshop",
    to: "homes",
    points: [
      { x: 452, y: 258 },
      { x: 422, y: 282 },
      { x: 382, y: 305 },
    ],
    width: 12,
  },
];

export function makePath(points: Point[]): Path {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
    lengths.push(total);
  }
  return { points, lengths, total };
}

export function route(from: Building, start: Point, to: Building, end: Point): Path {
  const startPoint = { x: start.x, y: start.y },
    endPoint = { x: end.x, y: end.y };
  if (from === to) return makePath([startPoint, endPoint]);
  let best = makePath([startPoint, endPoint]);
  let distance = Infinity;
  const visit = (zone: Building, points: Point[], seen: Building[]) => {
    if (zone === to) {
      const candidate = makePath([...points, endPoint]);
      if (candidate.total < distance) {
        best = candidate;
        distance = candidate.total;
      }
      return;
    }
    for (const bridge of BRIDGES) {
      const next = bridge.from === zone ? bridge.to : bridge.to === zone ? bridge.from : null;
      if (!next || seen.includes(next)) continue;
      const steps = bridge.from === zone ? bridge.points : bridge.points.slice().reverse();
      visit(next, [...points, ...steps], [...seen, next]);
    }
  };
  visit(from, [startPoint], [from]);
  return best;
}

export function samplePath(path: Path, progress: number, out: Point): void {
  const distance = Math.max(0, Math.min(1, progress)) * path.total;
  let previous = 0;
  for (let i = 0; i < path.lengths.length; i++) {
    const length = path.lengths[i]!;
    if (distance <= length) {
      const a = path.points[i]!,
        b = path.points[i + 1]!;
      const t = length === previous ? 1 : (distance - previous) / (length - previous);
      out.x = a.x + (b.x - a.x) * t;
      out.y = a.y + (b.y - a.y) * t;
      return;
    }
    previous = length;
  }
  const last = path.points[path.points.length - 1]!;
  out.x = last.x;
  out.y = last.y;
}
