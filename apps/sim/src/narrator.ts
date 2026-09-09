// Speech-bubble narrator — one line per agent per tick (ARCHITECTURE §6.1, PRD §12).
// Off path (default): static persona + tick/phase/action, clipped to NARRATION_MAX_CHARS.
// On path: injected `{complete}` with AbortSignal + LLM_TIMEOUT_MS; timeout/error/empty → static.
// No LLM SDK import — tests/CI inject a fake provider; real HTTP is M4.7 (RISKS R7).
import {
  LLM_TIMEOUT_MS,
  NARRATION_MAX_CHARS,
  type ActionKind,
  type RosterEntry,
  type StorylinePhase,
} from "@agent-town/shared";

export interface NarrateContext {
  tick: number;
  phase: StorylinePhase;
  lastActionKind: ActionKind;
}

export interface NarrateFlags {
  llmNarrator: boolean;
}

/** Injected completion; never a live Anthropic/OpenAI client in this package. */
export interface LlmProvider {
  complete(prompt: string, signal: AbortSignal): Promise<string>;
}

export function clipNarration(text: string, max = NARRATION_MAX_CHARS): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trimEnd();
}

export function staticNarration(agent: RosterEntry, ctx: NarrateContext): string {
  const meta = `t${ctx.tick} ${ctx.phase} ${ctx.lastActionKind}`;
  return clipNarration(`${agent.name}: ${agent.persona} (${meta})`);
}

function narratorPrompt(agent: RosterEntry, ctx: NarrateContext): string {
  return [
    `Write one in-character Agent Town speech bubble, max ${NARRATION_MAX_CHARS} characters.`,
    `Agent: ${agent.name} (${agent.role}). Persona: ${agent.persona}`,
    `Tick ${ctx.tick}, phase ${ctx.phase}, last action: ${ctx.lastActionKind}.`,
    "Reply with the bubble text only.",
  ].join(" ");
}

async function completeWithTimeout(
  provider: LlmProvider,
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`LLM narrator timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([provider.complete(prompt, controller.signal), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function narrate(
  agent: RosterEntry,
  ctx: NarrateContext,
  flags: NarrateFlags,
  provider?: LlmProvider,
  timeoutMs: number = LLM_TIMEOUT_MS,
): Promise<string> {
  const fallback = staticNarration(agent, ctx);
  if (!flags.llmNarrator || !provider) return fallback;
  try {
    const raw = await completeWithTimeout(provider, narratorPrompt(agent, ctx), timeoutMs);
    return clipNarration(raw) || fallback;
  } catch {
    return fallback;
  }
}
