// Optional Vercel AI SDK wrapper (ARCHITECTURE §6.2). Used only when
// LLM_ADVISOR=on and LLM_PROVIDER=anthropic|openai. Tests inject a fake
// `{complete}` and never import this module.
import type { LlmProvider } from "./narrator.js";

export type SdkLlmKind = "anthropic" | "openai";

const ANTHROPIC_MODEL = "claude-haiku-4-5";
const OPENAI_MODEL = "gpt-4o-mini";

export function createSdkLlmProvider(kind: SdkLlmKind): LlmProvider {
  return {
    async complete(prompt, signal) {
      const { generateText } = await import("ai");
      const model = await loadModel(kind);
      const { text } = await generateText({
        model,
        prompt,
        abortSignal: signal,
        maxRetries: 0,
      });
      return text;
    },
  };
}

async function loadModel(kind: SdkLlmKind) {
  if (kind === "anthropic") {
    const { anthropic } = await import("@ai-sdk/anthropic");
    return anthropic(ANTHROPIC_MODEL);
  }
  const { openai } = await import("@ai-sdk/openai");
  return openai(OPENAI_MODEL);
}
