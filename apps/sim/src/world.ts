// World snapshot for decide() — balances/jobs/loans/signals.
// USDC is 6-dec integer strings; math is BigInt only. Empty world → all idle.
// DEX volume → [0,1] via clamp(volume / DEX_VOLUME_NORM_USD, 0, 1) (Signal C).
// `getWorld` loads live ERC-20 balances + Signal C for the CLI tick loop.
import {
  AGENT_NAMES,
  ARC_RPC_URL_DEFAULT,
  ARC_TESTNET_CHAIN_ID,
  ARC_USDC_ADDRESS,
  BASE_RATE_SPREAD_BPS,
  ROSTER,
  computeBaseRateBps,
  computeMerchantPrice,
  computeTownRateBps,
  type AgentName,
} from "@agent-town/shared";
import { readRoster, resolveTreasuryAddress, type WalletRoster } from "@agent-town/circle";
import {
  createGraphClient,
  fetchExternalSignals,
  loanHistory,
  openJobs,
  scoreboard,
  type SubgraphJob,
  type SubgraphLoan,
} from "@agent-town/graphclient";
import {
  createPublicClient,
  defineChain,
  erc20Abi,
  http,
  parseAbi,
  type Address,
  type PublicClient,
} from "viem";

/** USD volume divisor for Signal C merchant price (1e8). Do not change DEX_PRICE_K. */
export const DEX_VOLUME_NORM_USD = 100_000_000 as const;

/** Base merchant unit price (0.5 USDC, 6 dec) before Signal C volume multiplier. */
export const MERCHANT_BASE_PRICE_USDC = "500000" as const;

const treasuryAbi = parseAbi([
  "function stats() view returns (uint256 outstanding, uint256 totalDeposits, uint256 loanCount, uint256 defaults, uint16 baseRateBps)",
  "function utilisationBps() view returns (uint16)",
]);

export type ExternalSignalsSnapshot = {
  usdcBorrowApyBps: number;
  dexVolume24hUsd: string;
  stale: boolean;
};

export type SubgraphWorldSnapshot = {
  scoreboard?: {
    treasuryBalanceUsdc: string;
    outstandingUsdc: string;
    baseRateBps: number;
    defaults: number;
  };
  jobs?: SubgraphJob[];
  loans?: SubgraphLoan[];
};

export interface GetWorldDeps {
  publicClient: PublicClient;
  roster: WalletRoster;
  treasuryAddress: Address;
  fetchSignals: (tick: number) => Promise<ExternalSignalsSnapshot>;
  fetchSubgraph?: () => Promise<SubgraphWorldSnapshot | null>;
}

export interface WorldJob {
  id: string;
  client: string;
  provider: string;
  amountUsdc: string;
  status: string;
}

export interface WorldLoan {
  id: string;
  borrower: string;
  principalUsdc: string;
  status: string;
  approvedAtTick: number | null;
}

export interface WorldAssignment {
  jobId: string;
  worker: AgentName;
  acceptedAtTick: number;
}

export interface WorldSignals {
  usdcBorrowApyBps: number;
  dexVolume24hUsd: string;
  stale: boolean;
}

export interface WorldTreasury {
  utilisationBps: number;
  outstandingUsdc: string;
  baseRateBps: number;
  defaults: number;
}

export interface WorldState {
  tick: number;
  balances: Partial<Record<AgentName, string>>;
  inventory: Partial<Record<AgentName, number>>;
  jobs: WorldJob[];
  loans: WorldLoan[];
  treasury: WorldTreasury;
  signals: WorldSignals;
  merchantPriceUsdc: string;
  restockCostUsdc: string;
  assignments: WorldAssignment[];
  creditScores: Partial<Record<AgentName, number>>;
  settledPayouts: Partial<Record<AgentName, string>>;
}

const USDC_INT = /^\d+$/;

/** Parse a 6-dec USDC string; invalid/missing → 0n. Never Number(). */
export function usdcBigint(value: string | undefined): bigint {
  if (!value || !USDC_INT.test(value)) return 0n;
  return BigInt(value);
}

/** `amount * num / den` in 6-dec USDC integer space (floored). */
export function mulUsdcRatio(amount: string, num: bigint, den: bigint): string {
  return ((usdcBigint(amount) * num) / den).toString();
}

/** Signal C: clamp(parse(volume) / 1e8, 0, 1). Non-finite → 0. */
export function normaliseDexVolume(dexVolume24hUsd: string): number {
  const n = Number(dexVolume24hUsd);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1, n / DEX_VOLUME_NORM_USD);
}

/** Merchant unit price from base + raw DEX USD volume (uses last-known volume when stale). */
export function priceFromSignals(basePriceUsdc: string, dexVolume24hUsd: string): string {
  return computeMerchantPrice(basePriceUsdc, normaliseDexVolume(dexVolume24hUsd));
}

export function isRosterAgent(name: string): name is AgentName {
  return (AGENT_NAMES as readonly string[]).includes(name);
}

/** Safe default: no cash, stocked merchants, matching rate, no jobs/loans → idle. */
export function emptyWorld(tick: number): WorldState {
  return {
    tick,
    balances: {},
    inventory: {},
    jobs: [],
    loans: [],
    treasury: {
      utilisationBps: 0,
      outstandingUsdc: "0",
      baseRateBps: computeBaseRateBps(0),
      defaults: 0,
    },
    signals: { usdcBorrowApyBps: 0, dexVolume24hUsd: "0", stale: false },
    merchantPriceUsdc: "0",
    restockCostUsdc: "0",
    assignments: [],
    creditScores: {},
    settledPayouts: {},
  };
}

/**
 * Map a pre-fetched snapshot → WorldState. No network (M4.3 / tests call this).
 * Caller supplies subgraph DTOs already filtered to the town roster.
 */
export function loadWorld(tick: number, input: Partial<Omit<WorldState, "tick">> = {}): WorldState {
  return { ...emptyWorld(tick), ...input, tick };
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function isRosterWorker(name: string): name is AgentName {
  return ROSTER.some((a) => a.name === name && a.role === "worker");
}

function agentNameForAddress(roster: WalletRoster, address: string): AgentName | undefined {
  const wallet = roster.wallets.find((w) => w.address.toLowerCase() === address.toLowerCase());
  if (!wallet || !isRosterAgent(wallet.name)) return undefined;
  return wallet.name;
}

function isZeroAddress(address: string | undefined): boolean {
  return !address || address.toLowerCase() === ZERO_ADDRESS;
}

function utilisationBps(outstandingUsdc: string, treasuryBalanceUsdc: string): number {
  const outstanding = usdcBigint(outstandingUsdc);
  const treasury = usdcBigint(treasuryBalanceUsdc);
  const total = outstanding + treasury;
  if (total === 0n) return 0;
  return Number((outstanding * 10_000n) / total);
}

function mapSubgraphLoan(loan: SubgraphLoan, roster: WalletRoster): WorldLoan | null {
  const borrower = agentNameForAddress(roster, loan.borrower.id);
  if (!borrower) return null;
  return {
    id: loan.id,
    borrower,
    principalUsdc: loan.principal,
    status: loan.status,
    approvedAtTick: null,
  };
}

function mapSubgraphJob(job: SubgraphJob, roster: WalletRoster): WorldJob | null {
  const client = agentNameForAddress(roster, job.client.id);
  if (!client) return null;
  const raw = job.provider.id?.trim() ?? "";
  if (isZeroAddress(raw)) {
    return { id: job.id, client, provider: "", amountUsdc: job.amount, status: job.status };
  }
  const named = agentNameForAddress(roster, raw);
  // Foreign (non-roster) provider must stay non-empty so workers do not treat it as open.
  return {
    id: job.id,
    client,
    provider: named ?? raw.toLowerCase(),
    amountUsdc: job.amount,
    status: job.status,
  };
}

function assignmentsFromJobs(tick: number, jobs: WorldJob[]): WorldAssignment[] {
  return jobs
    .filter((j) => isRosterWorker(j.provider) && j.status === "funded")
    .map((j) => ({
      jobId: j.id,
      worker: j.provider as AgentName,
      acceptedAtTick: Math.max(0, tick - 1),
    }));
}

async function fetchErc20Balances(
  publicClient: PublicClient,
  roster: WalletRoster,
): Promise<Partial<Record<AgentName, string>>> {
  const balances: Partial<Record<AgentName, string>> = {};
  const agents = roster.wallets.filter((w) => isRosterAgent(w.name));
  await Promise.all(
    agents.map(async (wallet) => {
      const amount = await publicClient.readContract({
        address: ARC_USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [wallet.address as Address],
      });
      balances[wallet.name as AgentName] = amount.toString();
    }),
  );
  return balances;
}

async function fetchOnChainTreasury(
  publicClient: PublicClient,
  treasuryAddress: Address,
): Promise<WorldTreasury | null> {
  try {
    const [stats, utilisation] = await Promise.all([
      publicClient.readContract({
        address: treasuryAddress,
        abi: treasuryAbi,
        functionName: "stats",
      }),
      publicClient.readContract({
        address: treasuryAddress,
        abi: treasuryAbi,
        functionName: "utilisationBps",
      }),
    ]);
    const [outstanding, , , defaults, baseRateBps] = stats;
    return {
      utilisationBps: utilisation,
      outstandingUsdc: outstanding.toString(),
      baseRateBps,
      defaults: Number(defaults),
    };
  } catch {
    return null;
  }
}

function treasuryFromSignals(
  signals: ExternalSignalsSnapshot,
  subgraph?: SubgraphWorldSnapshot["scoreboard"],
): WorldTreasury {
  if (subgraph) {
    return {
      utilisationBps: utilisationBps(subgraph.outstandingUsdc, subgraph.treasuryBalanceUsdc),
      outstandingUsdc: subgraph.outstandingUsdc,
      baseRateBps: subgraph.baseRateBps,
      defaults: subgraph.defaults,
    };
  }
  return {
    utilisationBps: 0,
    outstandingUsdc: "0",
    baseRateBps: computeTownRateBps({
      marketApyBps: signals.usdcBorrowApyBps,
      spreadBps: BASE_RATE_SPREAD_BPS,
      defaultPremiumBps: 0,
    }),
    defaults: 0,
  };
}

/** Build a live world snapshot for one tick (balances, Signal C, optional subgraph). */
export function createGetWorld(deps: GetWorldDeps): (tick: number) => Promise<WorldState> {
  return async (tick) => {
    const [balances, signals, subgraphSnap, onChainTreasury] = await Promise.all([
      fetchErc20Balances(deps.publicClient, deps.roster),
      deps.fetchSignals(tick),
      deps.fetchSubgraph?.() ?? Promise.resolve(null),
      fetchOnChainTreasury(deps.publicClient, deps.treasuryAddress),
    ]);

    const merchantPriceUsdc = priceFromSignals(MERCHANT_BASE_PRICE_USDC, signals.dexVolume24hUsd);
    const treasury =
      onChainTreasury ?? treasuryFromSignals(signals, subgraphSnap?.scoreboard ?? undefined);

    const jobs = (subgraphSnap?.jobs ?? [])
      .map((job) => mapSubgraphJob(job, deps.roster))
      .filter((job): job is WorldJob => job !== null);
    const loans = (subgraphSnap?.loans ?? [])
      .map((loan) => mapSubgraphLoan(loan, deps.roster))
      .filter((loan): loan is WorldLoan => loan !== null);
    const assignments = assignmentsFromJobs(tick, jobs);

    return loadWorld(tick, {
      balances,
      jobs,
      loans,
      assignments,
      treasury,
      signals: {
        usdcBorrowApyBps: signals.usdcBorrowApyBps,
        dexVolume24hUsd: signals.dexVolume24hUsd,
        stale: signals.stale,
      },
      merchantPriceUsdc,
    });
  };
}

const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || ARC_RPC_URL_DEFAULT] } },
});

/** CLI factory — reads roster, on-chain balances, Signal C, optional subgraph. */
export function createDefaultGetWorld(env: NodeJS.ProcessEnv = process.env): (tick: number) => Promise<WorldState> {
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });
  const roster = readRoster();
  const treasuryAddress = resolveTreasuryAddress(env) as Address;

  let graphClient: ReturnType<typeof createGraphClient> | null = null;
  try {
    graphClient = createGraphClient();
  } catch {
    // SUBGRAPH_URL missing — jobs/loans/scoreboard omitted.
  }

  const fetchSubgraph = graphClient
    ? async (): Promise<SubgraphWorldSnapshot | null> => {
        try {
          const [board, jobs, loans] = await Promise.all([
            scoreboard(graphClient!),
            openJobs(graphClient!),
            loanHistory(graphClient!),
          ]);
          return { scoreboard: board, jobs, loans };
        } catch {
          return null;
        }
      }
    : undefined;

  return createGetWorld({
    publicClient,
    roster,
    treasuryAddress,
    fetchSignals: (tick) => fetchExternalSignals({ tick }),
    fetchSubgraph,
  });
}
