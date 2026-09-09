// Data-source seam between the shared router (routes.ts) and where the data
// comes from. M0.7 ships `MockStore`; M4.7 adds a chain/subgraph/Supabase
// implementation and swaps it in `index.ts` — routes and SSE stay untouched.
import type {
  AgentDetailResponse,
  AgentsResponse,
  LoansQuery,
  LoansResponse,
  MayorFundRequest,
  MayorLoanDecisionRequest,
  MayorRateRequest,
  ScoreboardResponse,
  SseEvent,
  StateResponse,
  TxResponse,
} from "@agent-town/shared";

/** Thrown by a data source; routes map `code` → HTTP status. */
export class SourceError extends Error {
  constructor(
    readonly status: 400 | 404 | 501,
    readonly code: "BAD_REQUEST" | "NOT_FOUND" | "NOT_IMPLEMENTED",
    message: string,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

export type SseListener = (event: SseEvent) => void;

export interface DataSource {
  readonly mode: "mock" | "real";
  getState(): StateResponse;
  getAgents(): AgentsResponse;
  /** Throws SourceError(404) for unknown names. */
  getAgent(name: string): AgentDetailResponse;
  getScoreboard(): ScoreboardResponse;
  getLoans(query: LoansQuery): LoansResponse;
  mayorFund(body: MayorFundRequest): TxResponse;
  mayorLoanDecision(body: MayorLoanDecisionRequest): TxResponse;
  mayorRate(body: MayorRateRequest): TxResponse;
  /** Subscribe to live events; returns an unsubscribe fn. */
  subscribe(listener: SseListener): () => void;
}

/** Real mode placeholder until M4.7 — every call answers 501. */
export function notImplementedSource(): DataSource {
  const nyi = (): never => {
    throw new SourceError(501, "NOT_IMPLEMENTED", "real mode lands in M4.7");
  };
  return {
    mode: "real",
    getState: nyi,
    getAgents: nyi,
    getAgent: nyi,
    getScoreboard: nyi,
    getLoans: nyi,
    mayorFund: nyi,
    mayorLoanDecision: nyi,
    mayorRate: nyi,
    subscribe: nyi,
  };
}
