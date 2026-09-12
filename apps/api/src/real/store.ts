// Real DataSource — subgraph + ENS + Arc balances + optional Supabase tick ledger.
// Sync getters read a cache refreshed on an interval; SSE emits scoreboard snapshots.
import {
  ARC_EXPLORER_URL,
  ROSTER,
  ensNameFor,
  phaseForTick,
  type AgentDetailResponse,
  type AgentSummary,
  type AgentsResponse,
  type Job,
  type Loan,
  type LoansQuery,
  type LoansResponse,
  type MayorFundRequest,
  type MayorLoanDecisionRequest,
  type MayorRateRequest,
  type ScoreboardResponse,
  type Signals,
  type SseEvent,
  type StateResponse,
  type TxResponse,
  type VisitorChatRequest,
  type VisitorChatResponse,
  type VisitorCreateRequest,
  type VisitorResponse,
} from "@agent-town/shared";
import {
  createGraphClient,
  fetchExternalSignals,
  gdpSeries,
  loanHistory,
  rosterJobs,
  scoreboard as fetchScoreboard,
  type Scoreboard as GraphScoreboard,
  type SubgraphJob,
} from "@agent-town/graphclient";
import type { GraphQLClient } from "graphql-request";
import { createEnsClient, type ResolvedAgent } from "@agent-town/ens";
import { createCircleClient, readRoster, type CircleClient } from "@agent-town/circle";
import type { Address } from "@agent-town/shared";
import { SourceError, type DataSource, type SseListener } from "../source.js";
import { createBalanceReader, type BalanceReader } from "./balances.js";
import { parseRealEnv, type RealEnv } from "./env.js";
import { createLedgerReader, latestByTick, type LedgerReader, type TickAnchor } from "./ledger.js";
import { graphBackoffActive, retryUntilMs } from "./graphBackoff.js";
import { mapGdpSeriesPoints, mapJob, mapLoan } from "./map.js";
import { buildRateBreakdown } from "./rate.js";
import { diffSseEvents, emptySseCursor, type SseCursor } from "./sse.js";
import {
  defaultMayorWalletIds,
  mayorFund as executeMayorFund,
  mayorLoanDecision as executeMayorLoanDecision,
  mayorRate as executeMayorRate,
  type MayorDeps,
} from "./mayor.js";
import { createVisitorService, type VisitorService } from "./visitor.js";

const HOME_POSITION = {
  bank: { x: 0.5, y: 0.55 },
  market: { x: 0.45, y: 0.5 },
  workshop: { x: 0.4, y: 0.55 },
  homes: { x: 0.65, y: 0.65 },
} as const;

const DEFAULT_POLL_MS = 15_000;

export interface RealSourceOptions {
  tickMs: number;
  pollMs?: number;
  env?: NodeJS.ProcessEnv;
  graphClient?: GraphQLClient;
  ledger?: LedgerReader;
  balanceReader?: BalanceReader;
  resolveAgent?: (name: string) => Promise<ResolvedAgent>;
  circle?: CircleClient;
  mayorDeps?: MayorDeps;
}

interface RealCache {
  anchor: TickAnchor;
  anchorSec: number;
  state: StateResponse;
  agents: AgentsResponse;
  scoreboard: ScoreboardResponse;
  loans: Loan[];
  jobsByAgent: Map<string, Job[]>;
  ensByName: Map<string, ResolvedAgent>;
}

export class RealSource implements DataSource {
  readonly mode = "real" as const;

  private readonly tickMs: number;
  private readonly pollMs: number;
  private readonly env: RealEnv;
  private readonly graph: GraphQLClient;
  private readonly ledger: LedgerReader;
  private readonly readBalance: BalanceReader;
  private readonly resolveEns: (name: string) => Promise<ResolvedAgent>;
  private readonly mayor: MayorDeps | undefined;
  private readonly visitor: VisitorService | undefined;
  private readonly rosterAddresses: Map<string, Address>;

  private cache: RealCache | undefined;
  private readyPromise: Promise<void> | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private graphBackoffUntilMs = 0;
  private readonly listeners = new Set<SseListener>();
  private readonly sseCursor: SseCursor = emptySseCursor();

  constructor(options: RealSourceOptions) {
    this.tickMs = options.tickMs;
    this.pollMs = options.pollMs ?? options.tickMs ?? DEFAULT_POLL_MS;
    this.env = parseRealEnv(options.env);
    if (!this.env.subgraphUrl && !options.graphClient) {
      throw new Error("SUBGRAPH_URL is required for API real mode");
    }
    this.graph =
      options.graphClient ??
      createGraphClient({ url: this.env.subgraphUrl, apiKey: this.env.graphApiKey });
    this.ledger = options.ledger ?? createLedgerReader(this.env);
    this.readBalance = options.balanceReader ?? createBalanceReader(this.env.arcRpcUrl);
    this.resolveEns = options.resolveAgent ?? ((name) => createEnsClient().resolveAgent(name));
    const roster = readRoster();
    this.rosterAddresses = new Map(
      roster.wallets.filter((w) => w.name !== "mayor").map((w) => [w.name, w.address as Address]),
    );
    if (options.mayorDeps) {
      this.mayor = options.mayorDeps;
    } else {
      try {
        const circle = options.circle ?? createCircleClient(options.env);
        this.mayor = {
          circle,
          ...defaultMayorWalletIds(roster),
          broadcastAllowed: this.env.broadcastAllowed,
        };
      } catch {
        this.mayor = undefined;
      }
    }
    if (this.mayor) {
      this.visitor = createVisitorService({
        circle: this.mayor.circle,
        readBalance: this.readBalance,
        broadcastAllowed: this.env.broadcastAllowed,
        townName: this.env.townName,
        env: options.env ?? process.env,
      });
    }
  }

  async ready(): Promise<void> {
    if (!this.readyPromise) this.readyPromise = this.refresh();
    await this.readyPromise;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.refresh().catch((err: unknown) => console.error("[api] real refresh failed:", err));
    }, this.pollMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private emit(event: SseEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private emitRefreshEvents(
    tick: number,
    phase: StateResponse["phase"],
    actions: Awaited<ReturnType<LedgerReader["listActions"]>>,
    narrations: Awaited<ReturnType<LedgerReader["listNarration"]>>,
    loans: Loan[],
    scoreboard: ScoreboardResponse,
  ): void {
    for (const event of diffSseEvents({
      cursor: this.sseCursor,
      tick,
      phase,
      actions,
      narrations,
      loans,
      scoreboard,
    })) {
      this.emit(event);
    }
  }

  private ensureCache(): RealCache {
    if (!this.cache) throw new SourceError(501, "NOT_IMPLEMENTED", "real source not ready yet");
    return this.cache;
  }

  private anchorSec(anchor: TickAnchor): number {
    const ms = Date.parse(anchor.startedAt);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
  }

  private noteGraphError(err: unknown): void {
    const until = retryUntilMs(err);
    if (until !== undefined) this.graphBackoffUntilMs = until;
    const untilIso = until !== undefined ? new Date(until).toISOString() : "next poll";
    console.error(`[api] real graph refresh failed; backoff until ${untilIso}:`, err);
  }

  private composeScoreboard(
    tick: number,
    sb: GraphScoreboard,
    gdpPoints: ScoreboardResponse["gdpSeries"],
    loans: Loan[],
    signals: Signals,
  ): ScoreboardResponse {
    const outstanding = BigInt(sb.outstandingUsdc);
    const treasury = BigInt(sb.treasuryBalanceUsdc);
    const utilisationBps =
      treasury + outstanding === 0n
        ? 0
        : Number((outstanding * 10_000n) / (treasury + outstanding));
    const everApproved = loans.filter((l) => l.status !== "pending" && l.status !== "denied");
    return {
      gdpUsdc: gdpPoints.at(-1)?.gdpUsdc ?? "0",
      treasuryBalanceUsdc: sb.treasuryBalanceUsdc,
      outstandingUsdc: sb.outstandingUsdc,
      defaults: sb.defaults,
      defaultRateBps:
        everApproved.length === 0 ? 0 : Math.round((sb.defaults * 10_000) / everApproved.length),
      baseRateBps: sb.baseRateBps,
      ticks: tick,
      jobsCompleted: sb.jobsCompleted,
      loansOutstanding: sb.loansOutstanding,
      gdpSeries: gdpPoints,
      signals,
      rate: buildRateBreakdown({
        marketApyBps: signals.usdcBorrowApyBps,
        onChainBaseRateBps: sb.baseRateBps,
        defaults: sb.defaults,
        utilisationBps,
      }),
    };
  }

  private graphFieldsFromScoreboard(scoreboard: ScoreboardResponse): GraphScoreboard {
    return {
      treasuryBalanceUsdc: scoreboard.treasuryBalanceUsdc,
      outstandingUsdc: scoreboard.outstandingUsdc,
      baseRateBps: scoreboard.baseRateBps,
      jobsCompleted: scoreboard.jobsCompleted,
      loansOutstanding: scoreboard.loansOutstanding,
      defaults: scoreboard.defaults,
    };
  }

  private bucketJobs(jobs: SubgraphJob[], anchorSec: number): Map<string, Job[]> {
    const jobsByAgent = new Map<string, Job[]>();
    for (const name of this.rosterAddresses.keys()) jobsByAgent.set(name, []);
    for (const raw of jobs) {
      const mapped = mapJob(raw, this.env.townName, anchorSec, this.tickMs);
      const clientId = raw.client.id.toLowerCase();
      const providerId = raw.provider.id.toLowerCase();
      for (const [name, addr] of this.rosterAddresses) {
        const id = addr.toLowerCase();
        if (clientId !== id && providerId !== id) continue;
        jobsByAgent.get(name)?.push(mapped);
      }
    }
    return jobsByAgent;
  }

  private async fetchGraphSnapshot(anchorSec: number): Promise<{
    sb: GraphScoreboard;
    loans: Loan[];
    gdpPoints: ScoreboardResponse["gdpSeries"];
    jobsByAgent: Map<string, Job[]>;
  }> {
    const [sb, loansRaw, gdpRaw, jobsRaw] = await Promise.all([
      fetchScoreboard(this.graph),
      loanHistory(this.graph),
      gdpSeries(this.graph),
      rosterJobs(this.graph, { first: 160 }),
    ]);
    return {
      sb,
      loans: loansRaw.map((l) => mapLoan(l, this.env.townName, anchorSec, this.tickMs)),
      gdpPoints: mapGdpSeriesPoints(gdpRaw.points, anchorSec, this.tickMs),
      jobsByAgent: this.bucketJobs(jobsRaw, anchorSec),
    };
  }

  async refresh(): Promise<void> {
    const prior = this.cache;
    let anchor: TickAnchor;
    let ledgerActions: Awaited<ReturnType<LedgerReader["listActions"]>>;
    let ledgerNarration: Awaited<ReturnType<LedgerReader["listNarration"]>>;
    try {
      [anchor, ledgerActions, ledgerNarration] = await Promise.all([
        this.ledger.getTickAnchor(),
        this.ledger.listActions(),
        this.ledger.listNarration(),
      ]);
    } catch (err) {
      if (!prior) throw err;
      console.error("[api] real ledger refresh failed; keeping last-good:", err);
      return;
    }
    const tick = anchor.currentTick;
    const phase = anchor.currentTick > 0 ? anchor.phase : phaseForTick(tick);
    const anchorSec = this.anchorSec(anchor);

    const signalsPromise = fetchExternalSignals({
      tick,
      apiKey: this.env.graphApiKey,
      externalSignalsEnabled: this.env.flags.externalSignals,
    });

    let sb: GraphScoreboard = prior
      ? this.graphFieldsFromScoreboard(prior.scoreboard)
      : {
          treasuryBalanceUsdc: "0",
          outstandingUsdc: "0",
          baseRateBps: 0,
          jobsCompleted: 0,
          loansOutstanding: 0,
          defaults: 0,
        };
    let loans = prior?.loans ?? [];
    let gdpPoints = prior?.scoreboard.gdpSeries ?? [];
    let jobsByAgent = prior?.jobsByAgent ?? new Map<string, Job[]>();

    if (!graphBackoffActive(this.graphBackoffUntilMs)) {
      try {
        const snap = await this.fetchGraphSnapshot(anchorSec);
        this.graphBackoffUntilMs = 0;
        sb = snap.sb;
        loans = snap.loans;
        gdpPoints = snap.gdpPoints;
        jobsByAgent = snap.jobsByAgent;
      } catch (err) {
        this.noteGraphError(err);
      }
    }

    const signals = await signalsPromise;
    const scoreboard = this.composeScoreboard(tick, sb, gdpPoints, loans, signals);

    const ensByName = new Map<string, ResolvedAgent>();
    const agents: AgentSummary[] = [];
    const priorByName = new Map(prior?.agents.map((a) => [a.name, a]) ?? []);

    const rows = await Promise.all(
      ROSTER.map(async (entry) => {
        const arcAddress = this.rosterAddresses.get(entry.name);
        if (!arcAddress) return undefined;
        const ensName = ensNameFor(entry.name, this.env.townName);
        let resolved: ResolvedAgent | undefined;
        try {
          resolved = await this.resolveEns(entry.name);
        } catch (err) {
          console.warn(`[api] ENS resolve ${entry.name}:`, err);
        }
        let balanceUsdc = priorByName.get(entry.name)?.balanceUsdc ?? "0";
        try {
          balanceUsdc = await this.readBalance(arcAddress);
        } catch (err) {
          console.warn(`[api] balance ${entry.name}:`, err);
        }
        const action = latestByTick(ledgerActions, entry.name);
        const narration = latestByTick(ledgerNarration, entry.name);
        const home = HOME_POSITION[entry.home];
        return {
          resolved,
          agent: {
            name: entry.name,
            ensName: resolved?.ensName ?? ensName,
            role: entry.role,
            arcAddress,
            balanceUsdc,
            creditScore: resolved?.creditScore ?? null,
            position: { building: entry.home, x: home.x, y: home.y },
            lastDecision: action
              ? {
                  tick: action.tick,
                  kind: action.kind,
                  summary: `${action.kind} (tick ${action.tick})`,
                }
              : null,
            narration: narration?.text ?? null,
            avatar: entry.avatar,
          } satisfies AgentSummary,
        };
      }),
    );
    for (const row of rows) {
      if (!row) continue;
      if (row.resolved) ensByName.set(row.agent.name, row.resolved);
      agents.push(row.agent);
    }

    try {
      const extra = await this.visitor?.visitorSummary();
      if (extra && !agents.some((a) => a.name === extra.name)) agents.push(extra);
      else if (extra) {
        const i = agents.findIndex((a) => a.name === extra.name);
        if (i >= 0) agents[i] = extra;
      }
    } catch (err) {
      console.warn("[api] visitor summary:", err);
    }

    const stateResponse: StateResponse = {
      tick,
      phase,
      flags: this.env.flags,
      tickMs: this.tickMs,
      maxTicks: this.env.maxTicks,
      startedAt: anchor.startedAt,
    };

    this.cache = {
      anchor,
      anchorSec,
      state: stateResponse,
      agents,
      scoreboard,
      loans,
      jobsByAgent,
      ensByName,
    };

    this.emitRefreshEvents(tick, phase, ledgerActions, ledgerNarration, loans, scoreboard);
  }

  getState(): StateResponse {
    return this.ensureCache().state;
  }

  getAgents(): AgentsResponse {
    return this.ensureCache().agents;
  }

  getAgent(name: string): AgentDetailResponse {
    const cache = this.ensureCache();
    const agent = cache.agents.find((a) => a.name === name);
    if (!agent) throw new SourceError(404, "NOT_FOUND", `Agent ${name} not found`);
    const ens = cache.ensByName.get(name);
    return {
      ...agent,
      loans: cache.loans.filter((l) => l.borrower === name),
      jobs: cache.jobsByAgent.get(name) ?? [],
      reviews: ens?.reviews ?? [],
      links: {
        arcscan: `${ARC_EXPLORER_URL}/address/${agent.arcAddress}`,
        ens: `https://sepolia.app.ens.domains/${agent.ensName}`,
      },
    };
  }

  getScoreboard(): ScoreboardResponse {
    return this.ensureCache().scoreboard;
  }

  getLoans(query: LoansQuery): LoansResponse {
    const loans = this.ensureCache().loans;
    return query.status ? loans.filter((l) => l.status === query.status) : loans;
  }

  async mayorFund(body: MayorFundRequest): Promise<TxResponse> {
    if (!this.mayor) {
      throw new SourceError(501, "NOT_IMPLEMENTED", "Circle not configured for mayor fund");
    }
    const res = await executeMayorFund(this.mayor, body);
    await this.refresh();
    return res;
  }

  async mayorLoanDecision(body: MayorLoanDecisionRequest): Promise<TxResponse> {
    if (!this.mayor) {
      throw new SourceError(501, "NOT_IMPLEMENTED", "Circle not configured for loan decision");
    }
    const res = await executeMayorLoanDecision(this.mayor, body);
    await this.refresh();
    return res;
  }

  async mayorRate(body: MayorRateRequest): Promise<TxResponse> {
    if (!this.mayor) {
      throw new SourceError(501, "NOT_IMPLEMENTED", "Circle not configured for rate");
    }
    const res = await executeMayorRate(this.mayor, body);
    await this.refresh();
    return res;
  }

  getVisitor(): VisitorResponse | null {
    if (!this.visitor) return null;
    const art = this.visitor.getVisitor();
    if (!art) return null;
    const live = this.cache?.agents.find((a) => a.name === art.name);
    return live
      ? {
          name: live.name,
          ensName: live.ensName,
          role: live.role,
          arcAddress: live.arcAddress,
          balanceUsdc: live.balanceUsdc,
          explorerUrl: `${ARC_EXPLORER_URL}/address/${live.arcAddress}`,
          ensUrl: "https://explorer.ens.dev/",
        }
      : art;
  }

  async createVisitor(body: VisitorCreateRequest): Promise<VisitorResponse> {
    if (!this.visitor) {
      throw new SourceError(501, "NOT_IMPLEMENTED", "Circle not configured for visitor create");
    }
    const res = await this.visitor.createVisitor(body);
    await this.refresh();
    return this.getVisitor() ?? res;
  }

  async chatVisitor(body: VisitorChatRequest): Promise<VisitorChatResponse> {
    if (!this.visitor) {
      throw new SourceError(501, "NOT_IMPLEMENTED", "Circle not configured for visitor chat");
    }
    const res = await this.visitor.chatVisitor(body);
    await this.refresh();
    return res;
  }

  subscribe(listener: SseListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
