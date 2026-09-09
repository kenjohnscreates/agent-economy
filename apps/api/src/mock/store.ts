// In-memory mock state (RISKS R11: FE never blocks on chain readiness).
// Seeded from `FIXTURES`, advanced by a tick loop; every tick is a pure
// function of (tick, seeded PRNG) so FE screenshots reproduce.
// Inputs: shared fixtures + mayor POST bodies. Outputs: shared response shapes
// and SSE envelopes. USDC stays BigInt-string; no floats touch money.
import {
  ARC_EXPLORER_URL,
  BASE_RATE_SPREAD_BPS,
  DEMO_TICKS,
  FIXTURES,
  FIXTURE_TICK,
  LOAN_TERM_TICKS,
  computeBaseRateBps,
  computeTownRateBps,
  phaseForTick,
  type ActionKind,
  type AgentDetailResponse,
  type AgentSummary,
  type AgentsResponse,
  type Building,
  type GdpPoint,
  type Loan,
  type LoansQuery,
  type LoansResponse,
  type MayorFundRequest,
  type MayorLoanDecisionRequest,
  type MayorRateRequest,
  type Role,
  type ScoreboardResponse,
  type Signals,
  type SseEvent,
  type StateResponse,
  type TxEvent,
  type TxResponse,
} from "@agent-town/shared";
import { SourceError, type DataSource, type SseListener } from "../source.js";
import { createPrng, type Prng } from "./prng.js";

export interface MockStoreOptions {
  /** Real-mode cadence reported on /state. */
  tickMs: number;
  /** Mock loop cadence. */
  mockTickMs: number;
  now?: () => Date;
}

/** Tick at which the scripted `loan_flagged` pending loan appears (hike phase). */
export const FLAGGED_LOAN_TICK = 9;
const FLAGGED_LOAN_ID = "L-3";
/** `signals.stale` flips on every Nth tick so the FE badge can be tested. */
const STALE_EVERY_TICKS = 7;
const BUILDINGS: readonly Building[] = ["bank", "market", "workshop", "homes"];

const NARRATION_BY_ROLE: Record<Role, readonly string[]> = {
  treasurer: [
    "Books balanced; watching utilisation.",
    "Market rate moved — nudging our spread to match.",
    "One flagged loan on the desk. Mayor, your call.",
  ],
  merchant: [
    "Shelves are thin again — hiring!",
    "DEX volume is up, nudging prices a touch.",
    "Good week. Might pay that loan down early.",
  ],
  worker: [
    "Another job done, another coin in the bank.",
    "Best-paying job on the board — mine.",
    "Delivering tomorrow; deposit goes straight to the bank.",
  ],
  consumer: [
    "Prices are a bit steeper today, still worth it.",
    "Waiting for next stipend before shopping.",
    "Stipend landed — off to the market.",
  ],
};

const TX_KINDS: readonly ActionKind[] = ["buy", "deposit", "pay_stipend", "complete_job", "repay"];

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** 32-byte hex from the PRNG (8 × 32-bit chunks). */
function fakeTxHash(rng: Prng): string {
  let hex = "0x";
  for (let i = 0; i < 8; i++) hex += rng.int(0x100000000).toString(16).padStart(8, "0");
  return hex;
}

function explorerTxUrl(hash: string): string {
  return `${ARC_EXPLORER_URL}/tx/${hash}`;
}

/** outstanding / (treasury + outstanding) in bps; bigint math. */
function utilisationBps(outstanding: bigint, treasury: bigint): number {
  const denom = treasury + outstanding;
  return denom === 0n ? 0 : Number((outstanding * 10_000n) / denom);
}

/** "184532211.55" ± jitter, done in integer cents. */
function jitterUsdString(base: string, deltaCents: number): string {
  const [whole = "0", frac = ""] = base.split(".");
  const cents = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0").slice(0, 2)) + BigInt(deltaCents);
  const safe = cents < 0n ? 0n : cents;
  return `${safe / 100n}.${(safe % 100n).toString().padStart(2, "0")}`;
}

export class MockStore implements DataSource {
  readonly mode = "mock" as const;

  private tick: number = FIXTURE_TICK;
  private agents: AgentSummary[] = [];
  private loans: Loan[] = [];
  private jobs = structuredClone([...FIXTURES.jobs]);
  private gdpSeries: GdpPoint[] = [];
  private treasuryUsdc = 0n;
  private signals: Signals = structuredClone(FIXTURES.signals);
  private spreadBps: number = BASE_RATE_SPREAD_BPS;
  private defaultPremiumBps = FIXTURES.rate.defaultPremiumBps;
  private startedAt: string;
  private listeners = new Set<SseListener>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly now: () => Date;

  constructor(private readonly opts: MockStoreOptions) {
    this.now = opts.now ?? (() => new Date());
    this.startedAt = this.now().toISOString();
    this.seed(FIXTURE_TICK);
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.advance(), this.opts.mockTickMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  get currentTick(): number {
    return this.tick;
  }

  /** Reset every collection from fixtures and position the clock at `tick`. */
  seed(tick: number): void {
    this.tick = tick;
    this.agents = structuredClone([...FIXTURES.agents]);
    this.loans = structuredClone([...FIXTURES.loans]);
    this.jobs = structuredClone([...FIXTURES.jobs]);
    this.treasuryUsdc = BigInt(FIXTURES.scoreboard.treasuryBalanceUsdc);
    this.signals = structuredClone(FIXTURES.signals);
    this.spreadBps = FIXTURES.rate.spreadBps;
    this.defaultPremiumBps = FIXTURES.rate.defaultPremiumBps;
    // Keep only the GDP points already "in the past" (empty when tick < 1).
    this.gdpSeries = structuredClone(FIXTURES.scoreboard.gdpSeries.filter((p) => p.tick <= tick));
  }

  /** One mock tick: mutate state deterministically, then fan out SSE events. */
  advance(): void {
    // Wrap: re-seed at tick 0 so this tick's GDP point becomes the first one.
    if (this.tick >= DEMO_TICKS) this.seed(0);
    this.tick += 1;
    const tick = this.tick;
    const rng = createPrng(tick * 7919);

    for (const a of this.agents) this.moveAgent(a, rng);

    const narrated: AgentSummary[] = [];
    const narrationCount = 1 + rng.int(2);
    for (let i = 0; i < narrationCount; i++) {
      const a = rng.pick(this.agents);
      const lines = NARRATION_BY_ROLE[a.role];
      a.narration = lines[(tick + i) % lines.length] ?? a.narration;
      narrated.push(a);
    }

    // GDP grows by 0.5–2 USDC per tick (integer micro-USDC).
    const last = this.gdpSeries[this.gdpSeries.length - 1];
    const prevGdp = last ? BigInt(last.gdpUsdc) : 0n;
    const gdp = prevGdp + 500_000n + BigInt(rng.int(1_500_000));
    this.gdpSeries.push({ tick, gdpUsdc: gdp.toString() });

    this.signals = {
      ...this.signals,
      usdcBorrowApyBps: Math.max(0, FIXTURES.signals.usdcBorrowApyBps + rng.int(31) - 15),
      dexVolume24hUsd: jitterUsdString(FIXTURES.signals.dexVolume24hUsd, rng.int(2_000_000) - 1_000_000),
      fetchedAt: this.now().toISOString(),
      stale: tick % STALE_EVERY_TICKS === 0,
    };

    const flagged = tick === FLAGGED_LOAN_TICK ? this.flagLoan(tick) : undefined;

    this.emit({ event: "tick", data: { tick, phase: phaseForTick(tick) } });
    const txCount = 1 + rng.int(3);
    for (let i = 0; i < txCount; i++) this.emit({ event: "tx", data: this.randomTx(rng) });
    for (const a of narrated) {
      if (a.narration) this.emit({ event: "narration", data: { tick, agent: a.name, text: a.narration } });
    }
    if (flagged) this.emit({ event: "loan_flagged", data: flagged });
    this.emit({ event: "scoreboard", data: this.getScoreboard() });
  }

  private moveAgent(a: AgentSummary, rng: Prng): void {
    const base = FIXTURES.agents.find((f) => f.name === a.name)?.position ?? a.position;
    a.position = {
      building: rng.next() < 0.15 ? rng.pick(BUILDINGS) : a.position.building,
      x: clamp01(base.x + (rng.next() - 0.5) * 0.08),
      y: clamp01(base.y + (rng.next() - 0.5) * 0.08),
    };
  }

  private flagLoan(tick: number): Loan | undefined {
    if (this.loans.some((l) => l.id === FLAGGED_LOAN_ID)) return undefined;
    const loan: Loan = {
      id: FLAGGED_LOAN_ID,
      borrower: "cy",
      principalUsdc: "2000000",
      rateBps: this.rate().townRateBps,
      status: "pending",
      requestedAtTick: tick,
      approvedAtTick: null,
      dueAtTick: null,
      repaidUsdc: "0",
      defaultedAtTick: null,
      advisor: {
        decision: "flag",
        reasoning: "Utilisation 9% is fine but town just recorded a default; escalating to the mayor.",
        confidence: 0.55,
        source: "rules",
      },
    };
    this.loans.push(loan);
    return loan;
  }

  private randomTx(rng: Prng): TxEvent {
    const agent = rng.pick(this.agents);
    const counterparty = rng.pick(this.agents.filter((a) => a.name !== agent.name));
    const kind = rng.pick(TX_KINDS);
    const hash = fakeTxHash(rng);
    return {
      tick: this.tick,
      agent: agent.name,
      kind,
      amountUsdc: (100_000n + BigInt(rng.int(1_900_000))).toString(),
      counterparty: kind === "deposit" || kind === "repay" ? "treasury" : counterparty.name,
      txHash: hash,
      explorerUrl: explorerTxUrl(hash),
      status: "complete",
    };
  }

  private emit(event: SseEvent): void {
    for (const l of this.listeners) l(event);
  }

  private txResponse(): TxResponse {
    const hash = fakeTxHash(createPrng(Date.now() ^ this.tick));
    return { txHash: hash, explorerUrl: explorerTxUrl(hash) };
  }

  // ── derived ───────────────────────────────────────────────────────────────
  private outstandingUsdc(): bigint {
    return this.loans
      .filter((l) => l.status === "approved" || l.status === "defaulted")
      .reduce((sum, l) => sum + BigInt(l.principalUsdc) - BigInt(l.repaidUsdc), 0n);
  }

  private rate(): ScoreboardResponse["rate"] {
    const marketApyBps = this.signals.usdcBorrowApyBps;
    const baseRateBps =
      this.spreadBps === BASE_RATE_SPREAD_BPS
        ? computeBaseRateBps(marketApyBps)
        : computeTownRateBps({ marketApyBps, spreadBps: this.spreadBps, defaultPremiumBps: 0 });
    return {
      marketApyBps,
      spreadBps: this.spreadBps,
      defaultPremiumBps: this.defaultPremiumBps,
      utilisationBps: utilisationBps(this.outstandingUsdc(), this.treasuryUsdc),
      baseRateBps,
      townRateBps: computeTownRateBps({
        marketApyBps,
        spreadBps: this.spreadBps,
        defaultPremiumBps: this.defaultPremiumBps,
      }),
    };
  }

  // ── DataSource ────────────────────────────────────────────────────────────
  getState(): StateResponse {
    return {
      ...FIXTURES.state,
      tick: this.tick,
      phase: phaseForTick(this.tick),
      tickMs: this.opts.tickMs,
      startedAt: this.startedAt,
    };
  }

  getAgents(): AgentsResponse {
    return this.agents;
  }

  getAgent(name: string): AgentDetailResponse {
    const agent = this.agents.find((a) => a.name === name);
    if (!agent) throw new SourceError(404, "NOT_FOUND", `Agent ${name} not found`);
    return {
      ...agent,
      loans: this.loans.filter((l) => l.borrower === name),
      jobs: this.jobs.filter((j) => j.client === name || j.provider === name),
      reviews: name === FIXTURES.agentDetail.name ? FIXTURES.agentDetail.reviews : [],
      links: {
        arcscan: `${ARC_EXPLORER_URL}/address/${agent.arcAddress}`,
        ens: `https://sepolia.app.ens.domains/${agent.ensName}`,
      },
    };
  }

  getScoreboard(): ScoreboardResponse {
    const outstanding = this.outstandingUsdc();
    const everApproved = this.loans.filter((l) => l.status !== "pending" && l.status !== "denied");
    const defaults = this.loans.filter((l) => l.status === "defaulted").length;
    const last = this.gdpSeries[this.gdpSeries.length - 1];
    const rate = this.rate();
    return {
      gdpUsdc: last?.gdpUsdc ?? "0",
      treasuryBalanceUsdc: this.treasuryUsdc.toString(),
      outstandingUsdc: outstanding.toString(),
      defaults,
      defaultRateBps: everApproved.length === 0 ? 0 : Math.round((defaults * 10_000) / everApproved.length),
      baseRateBps: rate.baseRateBps,
      ticks: this.tick,
      jobsCompleted: this.jobs.filter((j) => j.status === "completed").length,
      loansOutstanding: this.loans.filter((l) => l.status === "approved" || l.status === "defaulted").length,
      gdpSeries: this.gdpSeries,
      signals: this.signals,
      rate,
    };
  }

  getLoans(query: LoansQuery): LoansResponse {
    return query.status ? this.loans.filter((l) => l.status === query.status) : this.loans;
  }

  mayorFund(body: MayorFundRequest): TxResponse {
    this.treasuryUsdc += BigInt(body.amountUsdc);
    const res = this.txResponse();
    this.emit({
      event: "tx",
      data: {
        tick: this.tick,
        agent: "mayor",
        kind: "deposit",
        amountUsdc: body.amountUsdc,
        counterparty: "treasury",
        txHash: res.txHash,
        explorerUrl: res.explorerUrl,
        status: "complete",
      },
    });
    this.emit({ event: "scoreboard", data: this.getScoreboard() });
    return res;
  }

  mayorLoanDecision(body: MayorLoanDecisionRequest): TxResponse {
    const loan = this.loans.find((l) => l.id === body.loanId);
    if (!loan) throw new SourceError(404, "NOT_FOUND", `Loan ${body.loanId} not found`);
    if (loan.status !== "pending") {
      throw new SourceError(400, "BAD_REQUEST", `Loan ${loan.id} is ${loan.status}, not pending`);
    }
    if (body.approve) {
      loan.status = "approved";
      loan.approvedAtTick = this.tick;
      loan.dueAtTick = this.tick + LOAN_TERM_TICKS;
      this.treasuryUsdc -= BigInt(loan.principalUsdc);
      const borrower = this.agents.find((a) => a.name === loan.borrower);
      if (borrower) {
        borrower.balanceUsdc = (BigInt(borrower.balanceUsdc) + BigInt(loan.principalUsdc)).toString();
      }
    } else {
      loan.status = "denied";
    }
    const res = this.txResponse();
    this.emit({
      event: "tx",
      data: {
        tick: this.tick,
        agent: "mayor",
        kind: body.approve ? "approve_loan" : "deny_loan",
        amountUsdc: body.approve ? loan.principalUsdc : null,
        counterparty: loan.borrower,
        txHash: res.txHash,
        explorerUrl: res.explorerUrl,
        status: "complete",
      },
    });
    this.emit({ event: "scoreboard", data: this.getScoreboard() });
    return res;
  }

  mayorRate(body: MayorRateRequest): TxResponse {
    // Mayor sets the base rate directly; express it as a spread over market so
    // the breakdown stays coherent and follows market moves on later ticks.
    this.spreadBps = Math.max(0, body.bps - this.signals.usdcBorrowApyBps);
    const res = this.txResponse();
    this.emit({
      event: "tx",
      data: {
        tick: this.tick,
        agent: "mayor",
        kind: "set_rate",
        amountUsdc: null,
        counterparty: "treasury",
        txHash: res.txHash,
        explorerUrl: res.explorerUrl,
        status: "complete",
      },
    });
    this.emit({ event: "scoreboard", data: this.getScoreboard() });
    return res;
  }

  subscribe(listener: SseListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
