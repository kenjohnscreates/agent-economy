// SSE contract for GET /events (ARCHITECTURE §6.3). Event names are the SSE
// `event:` field; each `data:` payload is JSON validated by the schema here.
// Inputs: unknown JSON per event. Outputs: `SSE_EVENTS`, per-event payload
// schemas, and the discriminated union `SseEvent` ({event, data}) for the FE feed.
import { z } from "zod";
import { LoanSchema, ScoreboardResponseSchema, TickSchema, TxHashSchema } from "./api.js";
import { ActionKindSchema } from "./rules.js";
import { StorylinePhaseSchema } from "./storyline.js";

export const SSE_EVENTS = ["tick", "tx", "narration", "loan_flagged", "scoreboard"] as const;
export const SseEventNameSchema = z.enum(SSE_EVENTS);
export type SseEventName = z.infer<typeof SseEventNameSchema>;

/** Max narration length so speech bubbles never overflow. */
export const NARRATION_MAX_CHARS = 120 as const;

export const TX_STATUSES = ["pending", "complete", "failed"] as const;
export const TxStatusSchema = z.enum(TX_STATUSES);
export type TxStatus = z.infer<typeof TxStatusSchema>;

// ── payloads ────────────────────────────────────────────────────────────────
export const TickEventSchema = z.object({ tick: TickSchema, phase: StorylinePhaseSchema });
export type TickEvent = z.infer<typeof TickEventSchema>;

export const TxEventSchema = z.object({
  tick: TickSchema,
  /** Agent label that initiated the action. */
  agent: z.string().min(1),
  kind: ActionKindSchema,
  txHash: TxHashSchema,
  explorerUrl: z.url(),
  status: TxStatusSchema,
});
export type TxEvent = z.infer<typeof TxEventSchema>;

export const NarrationEventSchema = z.object({
  tick: TickSchema,
  agent: z.string().min(1),
  text: z.string().min(1).max(NARRATION_MAX_CHARS),
});
export type NarrationEvent = z.infer<typeof NarrationEventSchema>;

export const LoanFlaggedEventSchema = LoanSchema;
export type LoanFlaggedEvent = z.infer<typeof LoanFlaggedEventSchema>;

export const ScoreboardEventSchema = ScoreboardResponseSchema;
export type ScoreboardEvent = z.infer<typeof ScoreboardEventSchema>;

/** Name → payload schema; use to validate a raw `MessageEvent` by its type. */
export const SSE_PAYLOAD_SCHEMAS = {
  tick: TickEventSchema,
  tx: TxEventSchema,
  narration: NarrationEventSchema,
  loan_flagged: LoanFlaggedEventSchema,
  scoreboard: ScoreboardEventSchema,
} as const satisfies Record<SseEventName, z.ZodType>;

// ── envelope union ──────────────────────────────────────────────────────────
/** Discriminated envelope `{event, data}` — what the FE feed reduces over. */
export const SseEventSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("tick"), data: TickEventSchema }),
  z.object({ event: z.literal("tx"), data: TxEventSchema }),
  z.object({ event: z.literal("narration"), data: NarrationEventSchema }),
  z.object({ event: z.literal("loan_flagged"), data: LoanFlaggedEventSchema }),
  z.object({ event: z.literal("scoreboard"), data: ScoreboardEventSchema }),
]);
export type SseEvent = z.infer<typeof SseEventSchema>;

/** Parse a raw SSE frame (`event` name + JSON-decoded `data`) into the union. */
export function parseSseEvent(event: string, data: unknown): SseEvent {
  return SseEventSchema.parse({ event, data });
}
