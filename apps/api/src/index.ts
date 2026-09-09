// @agent-town/api — REST + SSE backend entry point (ARCHITECTURE §6.3).
// `--mock` / API_MODE=mock serves shared fixtures advanced by a fake tick loop;
// real mode reads subgraph + ENS + Arc balances (M4.7).
import { serve } from "@hono/node-server";
import { parseConfig } from "./config.js";
import { MockStore } from "./mock/store.js";
import { RealSource } from "./real/store.js";
import { createApp } from "./routes.js";
import type { DataSource } from "./source.js";

const config = parseConfig();

let source: DataSource;
let shutdown = (): void => {};

if (config.mode === "mock") {
  const store = new MockStore({ tickMs: config.tickMs, mockTickMs: config.mockTickMs });
  store.start();
  shutdown = () => store.stop();
  source = store;
} else {
  const store = new RealSource({ tickMs: config.tickMs, pollMs: config.tickMs });
  await store.ready();
  store.start();
  shutdown = () => store.stop();
  source = store;
}

const server = serve({ fetch: createApp(source).fetch, port: config.port }, (info) => {
  console.log(
    `[api] ${config.mode} mode on http://localhost:${info.port}` +
      (config.mode === "mock"
        ? ` (mock tick every ${config.mockTickMs} ms)`
        : " (subgraph + ENS)"),
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    shutdown();
    server.close(() => process.exit(0));
  });
}
