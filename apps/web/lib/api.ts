// Typed fetchers for every route in the frozen contract. Each response is parsed
// with its shared zod schema so a shape drift fails loudly in the client, not in a
// component. USDC stays a 6-dec string end to end.
import {
  API_ROUTES,
  AgentDetailResponseSchema,
  AgentsResponseSchema,
  ApiErrorSchema,
  LoansResponseSchema,
  ScoreboardResponseSchema,
  StateResponseSchema,
  TxResponseSchema,
  type AgentDetailResponse,
  type AgentsResponse,
  type LoanStatus,
  type LoansResponse,
  type MayorFundRequest,
  type MayorLoanDecisionRequest,
  type MayorRateRequest,
  type ScoreboardResponse,
  type StateResponse,
  type TxResponse,
} from "@agent-town/shared";
import type { z } from "zod";
import { API_URL } from "./config";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
  base: string = API_URL,
): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = ApiErrorSchema.safeParse(body);
    throw new ApiRequestError(
      res.status,
      err.success ? err.data.code : "HTTP_ERROR",
      err.success ? err.data.error : `${res.status} ${res.statusText}`,
    );
  }
  return schema.parse(body);
}

export const api = {
  state: (base?: string): Promise<StateResponse> =>
    request(API_ROUTES.state, StateResponseSchema, undefined, base),
  agents: (base?: string): Promise<AgentsResponse> =>
    request(API_ROUTES.agents, AgentsResponseSchema, undefined, base),
  agent: (name: string, base?: string): Promise<AgentDetailResponse> =>
    request(API_ROUTES.agent(name), AgentDetailResponseSchema, undefined, base),
  scoreboard: (base?: string): Promise<ScoreboardResponse> =>
    request(API_ROUTES.scoreboard, ScoreboardResponseSchema, undefined, base),
  loans: (status?: LoanStatus, base?: string): Promise<LoansResponse> =>
    request(
      status ? `${API_ROUTES.loans}?status=${encodeURIComponent(status)}` : API_ROUTES.loans,
      LoansResponseSchema,
      undefined,
      base,
    ),
  mayorFund: (body: MayorFundRequest): Promise<TxResponse> =>
    request(API_ROUTES.mayorFund, TxResponseSchema, { method: "POST", body: JSON.stringify(body) }),
  mayorLoanDecision: (body: MayorLoanDecisionRequest): Promise<TxResponse> =>
    request(API_ROUTES.mayorLoanDecision, TxResponseSchema, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  mayorRate: (body: MayorRateRequest): Promise<TxResponse> =>
    request(API_ROUTES.mayorRate, TxResponseSchema, { method: "POST", body: JSON.stringify(body) }),
  eventsUrl: (base: string = API_URL): string => `${base}${API_ROUTES.events}`,
};
