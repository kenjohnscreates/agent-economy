/**
 * Unit tests for graphclient query helpers (mocked SDK).
 * Live subgraph evidence: live.test.ts (skipped without SUBGRAPH_URL).
 */
import { JOB_STATUSES } from "@agent-town/shared";
import type { GraphQLClient } from "graphql-request";
import { describe, expect, it, vi } from "vitest";
import { agentState } from "./agentState.js";
import { gdpSeries } from "./gdpSeries.js";
import { loanHistory } from "./loanHistory.js";
import { openJobs, rosterJobs } from "./openJobs.js";
import { scoreboard } from "./scoreboard.js";
import * as sdkModule from "../sdk.js";

const BO = "0x337512e3f78e9ad91493a98143b511c46c3775f7";

function mockSdk(impl: Record<string, unknown>) {
  const sdk = {
    AgentById: vi.fn(),
    AgentsByEnsName: vi.fn(),
    AgentLoans: vi.fn(),
    AgentJobs: vi.fn(),
    OpenTownJobs: vi.fn(),
    TownLoans: vi.fn(),
    BorrowerLoans: vi.fn(),
    TreasuryStateQuery: vi.fn(),
    RosterAgents: vi.fn(),
    OutstandingTownLoans: vi.fn(),
    TownJobPayments: vi.fn(),
    ...impl,
  };
  vi.spyOn(sdkModule, "createSdk").mockReturnValue(sdk as ReturnType<typeof sdkModule.createSdk>);
  return sdk;
}

const fakeClient = {} as GraphQLClient;

describe("agentState", () => {
  it("loads agent by address with loans and jobs", async () => {
    mockSdk({
      AgentById: vi.fn().mockResolvedValue({
        agent: {
          id: BO,
          ensName: "bo.botanica.eth",
          role: null,
          balanceDeposited: "200000",
          loansTaken: 2,
          defaults: 1,
          jobsCompleted: 0,
          earned: "0",
          spent: "500000",
        },
      }),
      AgentLoans: vi.fn().mockResolvedValue({
        loans: [
          {
            id: "1",
            principal: "300000",
            rateBps: 600,
            status: "repaid",
            requestedAt: "1",
            approvedAt: "2",
            repaid: "300000",
            defaultedAt: null,
            borrower: { id: BO, ensName: "bo.botanica.eth" },
          },
        ],
      }),
      AgentJobs: vi.fn().mockResolvedValue({ jobs: [] }),
    });

    const state = await agentState(fakeClient, BO);
    expect(state?.agent.ensName).toBe("bo.botanica.eth");
    expect(state?.loans[0]?.status).toBe("repaid");
  });
});

describe("openJobs", () => {
  it("returns roster-filtered open jobs", async () => {
    mockSdk({
      OpenTownJobs: vi.fn().mockResolvedValue({
        jobs: [
          {
            id: "99",
            amount: "500000",
            status: "open",
            createdAt: "1",
            settledAt: null,
            client: { id: BO, ensName: "bo.botanica.eth" },
            provider: { id: "0x70b1300425c37af893ca4841e4183e7f0a1bdb89", ensName: null },
          },
        ],
      }),
    });
    const jobs = await openJobs(fakeClient);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe("open");
  });
});

describe("rosterJobs", () => {
  it("queries OpenTownJobs with all job statuses", async () => {
    const sdk = mockSdk({
      OpenTownJobs: vi.fn().mockResolvedValue({ jobs: [] }),
    });
    await rosterJobs(fakeClient);
    expect(sdk.OpenTownJobs).toHaveBeenCalledWith(
      expect.objectContaining({ statuses: [...JOB_STATUSES] }),
    );
  });
});

describe("loanHistory", () => {
  it("loads all town loans when borrower omitted", async () => {
    mockSdk({
      TownLoans: vi.fn().mockResolvedValue({
        loans: [
          {
            id: "2",
            principal: "200000",
            rateBps: 600,
            status: "defaulted",
            requestedAt: "1",
            approvedAt: "2",
            repaid: "0",
            defaultedAt: "3",
            borrower: { id: BO, ensName: "bo.botanica.eth" },
          },
        ],
      }),
    });
    const loans = await loanHistory(fakeClient);
    expect(loans[0]?.status).toBe("defaulted");
  });
});

describe("scoreboard", () => {
  it("aggregates treasury and roster counts", async () => {
    mockSdk({
      TreasuryStateQuery: vi.fn().mockResolvedValue({
        treasuryState: {
          id: "treasury",
          balance: "3000000",
          outstanding: "0",
          baseRateBps: 600,
        },
      }),
      RosterAgents: vi.fn().mockResolvedValue({
        agents: [{ id: BO, jobsCompleted: 1, defaults: 1 }],
      }),
      OutstandingTownLoans: vi.fn().mockResolvedValue({ loans: [] }),
    });
    const board = await scoreboard(fakeClient);
    expect(board.treasuryBalanceUsdc).toBe("3000000");
    expect(board.jobsCompleted).toBe(1);
    expect(board.defaults).toBe(1);
  });
});

describe("gdpSeries", () => {
  it("buckets roster job_pay payments by day", async () => {
    mockSdk({
      TownJobPayments: vi.fn().mockResolvedValue({
        payments: [
          { amount: "500000", timestamp: "1788935601", from: { id: BO }, to: { id: "0x1" } },
        ],
      }),
    });
    const series = await gdpSeries(fakeClient, { interval: "day" });
    expect(series.source).toBe("rosterPayments");
    expect(series.points[0]?.gdpUsdc).toBe("500000");
  });
});
