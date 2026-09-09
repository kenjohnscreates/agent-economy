// Runtime config for apps/api (ARCHITECTURE §6.1 flags). Reads CLI flags first,
// then env, then defaults. Inputs: argv + env. Output: a frozen `ApiConfig`.
import { API_DEFAULT_PORT } from "@agent-town/shared";

export type ApiMode = "mock" | "real";

export interface ApiConfig {
  mode: ApiMode;
  port: number;
  /** Real-mode tick cadence (informational for /state). */
  tickMs: number;
  /** Mock tick loop cadence. */
  mockTickMs: number;
}

const DEFAULT_TICK_MS = 15_000;
const DEFAULT_MOCK_TICK_MS = 5_000;

/** `--port 4000` or `--port=4000`; returns undefined when absent. */
function flagValue(argv: readonly string[], name: string): string | undefined {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function parseConfig(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): ApiConfig {
  const mode: ApiMode = argv.includes("--mock") || env.API_MODE === "mock" ? "mock" : "real";
  return Object.freeze({
    mode,
    port: positiveInt(flagValue(argv, "port") ?? env.PORT, API_DEFAULT_PORT),
    tickMs: positiveInt(env.TICK_MS, DEFAULT_TICK_MS),
    mockTickMs: positiveInt(env.MOCK_TICK_MS, DEFAULT_MOCK_TICK_MS),
  });
}
