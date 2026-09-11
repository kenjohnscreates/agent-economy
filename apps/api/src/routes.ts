// Shared router for mock + real modes (ARCHITECTURE §6.3). Every response is
// parsed by its shared zod schema BEFORE sending: a shape bug is a 500 here,
// not a broken FE. Inputs: a `DataSource`. Output: a Hono app.
import {
  API_ROUTES,
  AgentDetailResponseSchema,
  AgentsResponseSchema,
  ApiErrorSchema,
  LoansQuerySchema,
  LoansResponseSchema,
  MayorFundRequestSchema,
  MayorLoanDecisionRequestSchema,
  MayorRateRequestSchema,
  ScoreboardResponseSchema,
  StateResponseSchema,
  TxResponseSchema,
  type ApiError,
} from "@agent-town/shared";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { sseRoute } from "./sse.js";
import { SourceError, type DataSource } from "./source.js";

/** Thrown when a request body / query fails its shared schema → 400. */
class BadRequestError extends Error {
  constructor(readonly issues: z.ZodError) {
    super(z.prettifyError(issues));
    this.name = "BadRequestError";
  }
}

function apiError(c: Context, status: ContentfulStatusCode, body: ApiError): Response {
  return c.json(ApiErrorSchema.parse(body), status);
}

/** Parse unknown JSON (body/query) with a shared request schema or throw 400. */
function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestError(result.error);
  return result.data;
}

async function jsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new BadRequestError(new z.ZodError([{ code: "custom", message: "invalid JSON body", path: [] }]));
  }
}

export function createApp(source: DataSource): Hono {
  const app = new Hono();

  // FE dev server + anything else on localhost while we iterate.
  app.use("*", cors({ origin: (origin) => origin || "http://localhost:3000" }));

  app.onError((err, c) => {
    if (err instanceof SourceError) return apiError(c, err.status, { error: err.message, code: err.code });
    if (err instanceof BadRequestError) return apiError(c, 400, { error: err.message, code: "BAD_REQUEST" });
    if (err instanceof z.ZodError) {
      console.error("[api] response failed shared contract:", z.prettifyError(err));
      return apiError(c, 500, { error: "response failed shared contract", code: "CONTRACT_VIOLATION" });
    }
    console.error("[api] unhandled:", err);
    return apiError(c, 500, { error: "internal error", code: "INTERNAL" });
  });

  app.notFound((c) => apiError(c, 404, { error: `No route ${c.req.method} ${c.req.path}`, code: "NOT_FOUND" }));

  app.get("/health", (c) => {
    let tick: number | null = null;
    try {
      tick = source.getState().tick;
    } catch {
      tick = null;
    }
    return c.json({ ok: true, mode: source.mode, tick });
  });

  app.get(API_ROUTES.state, (c) => c.json(StateResponseSchema.parse(source.getState())));
  app.get(API_ROUTES.agents, (c) => c.json(AgentsResponseSchema.parse(source.getAgents())));
  app.get(`${API_ROUTES.agents}/:name`, (c) =>
    c.json(AgentDetailResponseSchema.parse(source.getAgent(c.req.param("name")))),
  );
  app.get(API_ROUTES.scoreboard, (c) => c.json(ScoreboardResponseSchema.parse(source.getScoreboard())));
  app.get(API_ROUTES.loans, (c) => {
    const query = parseInput(LoansQuerySchema, c.req.query());
    return c.json(LoansResponseSchema.parse(source.getLoans(query)));
  });
  app.get(API_ROUTES.events, sseRoute(source));

  app.post(API_ROUTES.mayorFund, async (c) => {
    const body = parseInput(MayorFundRequestSchema, await jsonBody(c));
    return c.json(TxResponseSchema.parse(await Promise.resolve(source.mayorFund(body))));
  });
  app.post(API_ROUTES.mayorLoanDecision, async (c) => {
    const body = parseInput(MayorLoanDecisionRequestSchema, await jsonBody(c));
    return c.json(
      TxResponseSchema.parse(await Promise.resolve(source.mayorLoanDecision(body))),
    );
  });
  app.post(API_ROUTES.mayorRate, async (c) => {
    const body = parseInput(MayorRateRequestSchema, await jsonBody(c));
    return c.json(TxResponseSchema.parse(await Promise.resolve(source.mayorRate(body))));
  });

  return app;
}
