// Real DataSource — subgraph + ENS + Arc balances + optional Supabase tick ledger.
// Sync getters read a cache refreshed on an interval; SSE emits scoreboard snapshots.
import {
  ARC_EXPLORER_URL,
  DEFAULT_PREMIUM_BPS,
  ROSTER,
  computeTownRateBps,
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
  type StateResponse,
  type TxResponse,
} from "@agent-town/shared";
import {
  agentState,
  createGraphClient,
  fetchExternalSignals,
  gdpSeries,
  loanHistory,
  scoreboard as fetchScoreboard,
} from "@agent-town/graphclient";
import type { GraphQLClient } from "graphql-request";
import { createEnsClient, type ResolvedAgent } from "@agent-town/ens";
import { createCircleClient, readRoster, type CircleClient } from "@agent-town/circle";
import type { Address } from "@agent-town/shared";
import { SourceError, type DataSource, type SseListener } from "../source.js";
import { createBalanceReader, type BalanceReader } from "./balances.js";
import { parseRealEnv, type RealEnv } from "./env.js";
import { createLedgerReader, type LedgerReader, type TickAnchor } from "./ledger.js";
import { mapGdpSeriesPoints, mapJob, mapLoan } from "./map.js";
import {
  defaultMayorWalletIds,
  mayorFund as executeMayorFund,
  mayorLoanDecision as executeMayorLoanDecision,
  mayorRate as executeMayorRate,
  type MayorDeps,
} from "./mayor.js";

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
  private readonly rosterAddresses: Map<string, Address>;

  private cache: RealCache | undefined;
  private readyPromise: Promise<void> | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly listeners = new Set<SseListener>();

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
    this.resolveEns =
      options.resolveAgent ??
      ((name) => createEnsClient().resolveAgent(name));
    const roster = readRoster();
    this.rosterAddresses = new Map(
      roster.wallets
        .filter((w) => w.name !== "mayor")
        .map((w) => [w.name, w.address as Address]),
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
  }

  async ready(): Promise<void> {
    if (!this.readyPromise) this.readyPromise = this.refresh();
    await this.readyPromise;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.refresh()
        .then(() => this.emitScoreboard())
        .catch((err: unknown) => console.error("[api] real refresh failed:", err));
    }, this.pollMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private emitScoreboard(): void {
    if (!this.cache) return;
    const event = { event: "scoreboard" as const, data: this.cache.scoreboard };
    for (const listener of this.listeners) listener(event);
  }

  private ensureCache(): RealCache {
    if (!this.cache) throw new SourceError(501, "NOT_IMPLEMENTED", "real source not ready yet");
    return this.cache;
  }

  private anchorSec(anchor: TickAnchor): number {
    const ms = Date.parse(anchor.startedAt);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
  }

  async refresh(): Promise<void> {
    const anchor = await this.ledger.getTickAnchor();
    const tick = anchor.currentTick;
    const phase = anchor.currentTick > 0 ? anchor.phase : phaseForTick(tick);
    const anchorSec = this.anchorSec(anchor);

    const [sb, signals, loansRaw, gdpRaw] = await Promise.all([
      fetchScoreboard(this.graph),
      fetchExternalSignals({
        tick,
        apiKey: this.env.graphApiKey,
        externalSignalsEnabled: this.env.flags.externalSignals,
      }),
      loanHistory(this.graph),
      gdpSeries(this.graph),
    ]);

    const loans = loansRaw.map((l) => mapLoan(l, this.env.townName, anchorSec, this.tickMs));
    const gdpPoints = mapGdpSeriesPoints(gdpRaw.points, anchorSec, this.tickMs);
    const gdpUsdc = gdpPoints.at(-1)?.gdpUsdc ?? "0";

    const outstanding = BigInt(sb.outstandingUsdc);
    const treasury = BigInt(sb.treasuryBalanceUsdc);
    const utilisationBps =
      treasury + outstanding === 0n
        ? 0
        : Number((outstanding * 10_000n) / (treasury + outstanding));

    const everApproved = loans.filter((l) => l.status !== "pending" && l.status !== "denied");
    const defaultPremiumBps = sb.defaults > 0 ? DEFAULT_PREMIUM_BPS : 0;
    const marketApyBps = signals.usdcBorrowApyBps;
    const spreadBps = Math.max(0, sb.baseRateBps - marketApyBps);
    const rate = {
      marketApyBps,
      spreadBps,
      defaultPremiumBps,
      utilisationBps,
      baseRateBps: sb.baseRateBps,
      townRateBps: computeTownRateBps({
        marketApyBps,
        spreadBps,
        defaultPremiumBps,
      }),
    };

    const scoreboard: ScoreboardResponse = {
      gdpUsdc,
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
      rate,
    };

    const ensByName = new Map<string, ResolvedAgent>();
    const agents: AgentSummary[] = [];
    const jobsByAgent = new Map<string, Job[]>();

    for (const entry of ROSTER) {
      const arcAddress = this.rosterAddresses.get(entry.name);
      if (!arcAddress) continue;
      const ensName = ensNameFor(entry.name, this.env.townName);
      let resolved: ResolvedAgent | undefined;
      try {
        resolved = await this.resolveEns(entry.name);
        ensByName.set(entry.name, resolved);
      } catch (err) {
        console.warn(`[api] ENS resolve ${entry.name}:`, err);
      }
      const [balanceUsdc, action, narration, state] = await Promise.all([
        this.readBalance(arcAddress),
        this.ledger.latestAction(entry.name),
        this.ledger.latestNarration(entry.name),
        agentState(this.graph, arcAddress, { recentLoans: 20, recentJobs: 20 }),
      ]);

      const agentJobs = (state?.jobs ?? []).map((j) =>
        mapJob(j, this.env.townName, anchorSec, this.tickMs),
      );
      jobsByAgent.set(entry.name, agentJobs);

      const home = HOME_POSITION[entry.home];
      agents.push({
        name: entry.name,
        ensName: resolved?.ensName ?? ensName,
        role: entry.role,
        arcAddress,
        balanceUsdc,
        creditScore: resolved?.creditScore ?? null,
        position: { building: entry.home, x: home.x, y: home.y },
        lastDecision: action
          ? { tick: action.tick, kind: action.kind, summary: `${action.kind} (tick ${action.tick})` }
          : null,
        narration: narration?.text ?? null,
        avatar: entry.avatar,
      });
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
    this.emitScoreboard();
    return res;
  }

  async mayorLoanDecision(body: MayorLoanDecisionRequest): Promise<TxResponse> {
    if (!this.mayor) {
      throw new SourceError(501, "NOT_IMPLEMENTED", "Circle not configured for loan decision");
    }
    const res = await executeMayorLoanDecision(this.mayor, body);
    await this.refresh();
    this.emitScoreboard();
    return res;
  }

  async mayorRate(body: MayorRateRequest): Promise<TxResponse> {
    if (!this.mayor) {
      throw new SourceError(501, "NOT_IMPLEMENTED", "Circle not configured for rate");
    }
    const res = await executeMayorRate(this.mayor, body);
    await this.refresh();
    this.emitScoreboard();
    return res;
  }

  subscribe(listener: SseListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
