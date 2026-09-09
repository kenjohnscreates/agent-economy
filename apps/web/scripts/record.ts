// Record the mock (or real) stream into fixtures/replay.json for backend-free replay.
// Captures every SSE frame plus an /agents snapshot after each `tick` (positions
// and balances only live on /agents). Usage:
//   pnpm --filter @agent-town/web record -- --seconds 60 --api http://localhost:3001
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { API_ROUTES, AgentsResponseSchema, parseSseEvent, SSE_EVENTS } from "@agent-town/shared";

const args = process.argv.slice(2);
const flag = (n: string, d: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1] ?? d) : d;
};
const API = flag("api", "http://localhost:3001");
const SECONDS = Number(flag("seconds", "60"));
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/replay.json");

type Frame = { t: number; event: string; data: unknown };
const frames: Frame[] = [];
const t0 = Date.now();
const names = new Set<string>(SSE_EVENTS);

async function snapshotAgents(): Promise<void> {
  const res = await fetch(`${API}${API_ROUTES.agents}`);
  frames.push({
    t: Date.now() - t0,
    event: "agents",
    data: AgentsResponseSchema.parse(await res.json()),
  });
}

async function main() {
  const health = await fetch(`${API}/health`).then((r) => r.json());
  const mockTickMs = Number(process.env["MOCK_TICK_MS"] ?? 5000);
  console.log(`recording ${API} for ${SECONDS}s (health: ${JSON.stringify(health)})`);
  await snapshotAgents();

  const ctrl = new AbortController();
  const res = await fetch(`${API}${API_ROUTES.events}`, {
    signal: ctrl.signal,
    headers: { accept: "text/event-stream" },
  });
  if (!res.body) throw new Error("no body");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const stop = setTimeout(() => ctrl.abort(), SECONDS * 1000);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let ev = "";
        let data = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) ev = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (!ev || !names.has(ev)) continue;
        const parsed = parseSseEvent(ev, JSON.parse(data));
        frames.push({ t: Date.now() - t0, event: parsed.event, data: parsed.data });
        if (parsed.event === "tick") await snapshotAgents();
      }
    }
  } catch (e) {
    if (!(e instanceof Error && e.name === "AbortError")) throw e;
  } finally {
    clearTimeout(stop);
  }
  const file = {
    version: 1,
    recordedAt: new Date(t0).toISOString(),
    source: API,
    mockTickMs,
    frames,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(file) + "\n");
  const ticks = frames.filter((f) => f.event === "tick").length;
  console.log(`wrote ${OUT}: ${frames.length} frames, ${ticks} ticks`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
