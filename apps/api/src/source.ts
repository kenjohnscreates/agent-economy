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
  VisitorChatRequest,
  VisitorChatResponse,
  VisitorCreateRequest,
  VisitorResponse,
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
  mayorFund(body: MayorFundRequest): TxResponse | Promise<TxResponse>;
  mayorLoanDecision(body: MayorLoanDecisionRequest): TxResponse | Promise<TxResponse>;
  mayorRate(body: MayorRateRequest): TxResponse | Promise<TxResponse>;
  getVisitor(label?: string): VisitorResponse | null | Promise<VisitorResponse | null>;
  createVisitor(body: VisitorCreateRequest): VisitorResponse | Promise<VisitorResponse>;
  chatVisitor(body: VisitorChatRequest): VisitorChatResponse | Promise<VisitorChatResponse>;
  /** Subscribe to live events; returns an unsubscribe fn. */
  subscribe(listener: SseListener): () => void;
}
