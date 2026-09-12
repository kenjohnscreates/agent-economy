// Real-mode env flags for apps/api (ARCHITECTURE §6.1 / §8).
import type { FeatureFlags, StorylineMode } from "@agent-town/shared";

const DEFAULT_MAX_TICKS = 50;

function flagOn(env: NodeJS.ProcessEnv, key: string, defaultOn = false): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return defaultOn;
  return raw === "on" || raw === "true" || raw === "1";
}

export interface RealEnv {
  townName: string;
  maxTicks: number;
  flags: FeatureFlags;
  supabaseUrl?: string;
  supabaseServiceKey?: string;
  arcRpcUrl?: string;
  subgraphUrl?: string;
  graphApiKey?: string;
  broadcastAllowed: boolean;
  /** Visitor create/chat (public mint). Mayor POSTs still need broadcastAllowed. */
  visitorAllowed: boolean;
}

export function parseRealEnv(env: NodeJS.ProcessEnv = process.env): RealEnv {
  const storyline = (env.STORYLINE?.trim().toLowerCase() === "free" ? "free" : "demo") as StorylineMode;
  const maxTicks = Number(env.MAX_TICKS);
  return {
    townName: env.ENS_TOWN_NAME?.trim() || "botanica",
    maxTicks: Number.isInteger(maxTicks) && maxTicks > 0 ? maxTicks : DEFAULT_MAX_TICKS,
    flags: {
      llmAdvisor: flagOn(env, "LLM_ADVISOR"),
      llmNarrator: flagOn(env, "LLM_NARRATOR"),
      externalSignals: flagOn(env, "EXTERNAL_SIGNALS", true),
      storyline,
    },
    supabaseUrl: env.SUPABASE_URL?.trim() || undefined,
    supabaseServiceKey: env.SUPABASE_SERVICE_KEY?.trim() || undefined,
    arcRpcUrl: env.ARC_RPC_URL?.trim() || undefined,
    subgraphUrl: env.SUBGRAPH_URL?.trim() || undefined,
    graphApiKey: env.GRAPH_API_KEY?.trim() || undefined,
    broadcastAllowed: env.ALLOW_BROADCAST === "true",
    visitorAllowed: env.ALLOW_VISITOR === "true" || env.ALLOW_BROADCAST === "true",
  };
}
