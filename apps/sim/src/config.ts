// Sim runtime config — env + CLI flags for the tick engine (ARCHITECTURE §6.1).
// Parses TICK_MS, MAX_TICKS, feature flags and optional Supabase creds at the
// zod boundary. Inputs: argv + process.env. Output: frozen `SimConfig`.
import {
  FeatureFlagsSchema,
  StorylineModeSchema,
  type FeatureFlags,
  type StorylineMode,
} from "@agent-town/shared";
import { z } from "zod";

const DEFAULT_TICK_MS = 15_000;
const DEFAULT_MAX_TICKS = 50;

const OnOffSchema = z.enum(["on", "off"]);

const EnvSchema = z.object({
  TICK_MS: z.coerce.number().int().positive().optional(),
  MAX_TICKS: z.coerce.number().int().positive().optional(),
  LLM_ADVISOR: OnOffSchema.optional(),
  LLM_NARRATOR: OnOffSchema.optional(),
  EXTERNAL_SIGNALS: OnOffSchema.optional(),
  STORYLINE: StorylineModeSchema.optional(),
  SUPABASE_URL: z.url().optional().or(z.literal("")),
  SUPABASE_SERVICE_KEY: z.string().optional(),
});

export interface SimConfig {
  tickMs: number;
  maxTicks: number;
  flags: FeatureFlags;
  supabaseUrl?: string;
  supabaseServiceKey?: string;
}

/** `--ticks 5` or `--ticks=5`; returns undefined when absent. */
export function flagValue(argv: readonly string[], name: string): string | undefined {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

function onOff(raw: string | undefined, defaultOn: boolean): boolean {
  if (raw === undefined) return defaultOn;
  return raw === "on";
}

function parseFlags(env: z.infer<typeof EnvSchema>): FeatureFlags {
  const flags = {
    llmAdvisor: onOff(env.LLM_ADVISOR, false),
    llmNarrator: onOff(env.LLM_NARRATOR, false),
    externalSignals: onOff(env.EXTERNAL_SIGNALS, true),
    storyline: env.STORYLINE ?? ("demo" satisfies StorylineMode),
  };
  return FeatureFlagsSchema.parse(flags);
}

export function parseSimConfig(rawEnv: NodeJS.ProcessEnv = process.env): SimConfig {
  const env = EnvSchema.parse(rawEnv);
  const supabaseUrl = env.SUPABASE_URL?.trim() || undefined;
  const supabaseServiceKey = env.SUPABASE_SERVICE_KEY?.trim() || undefined;

  return Object.freeze({
    tickMs: env.TICK_MS ?? DEFAULT_TICK_MS,
    maxTicks: env.MAX_TICKS ?? DEFAULT_MAX_TICKS,
    flags: parseFlags(env),
    supabaseUrl,
    supabaseServiceKey,
  });
}

export interface CliOptions {
  once: boolean;
  ticks?: number;
}

export function parseCliOptions(argv: readonly string[]): CliOptions {
  const once = argv.includes("--once");
  const ticksRaw = flagValue(argv, "ticks");
  const ticks = ticksRaw !== undefined ? Number(ticksRaw) : undefined;
  if (ticks !== undefined && (!Number.isInteger(ticks) || ticks < 1)) {
    throw new Error(`Invalid --ticks value: ${ticksRaw}`);
  }
  if (once && ticks !== undefined) {
    throw new Error("Use either --once or --ticks, not both");
  }
  return { once, ticks };
}
