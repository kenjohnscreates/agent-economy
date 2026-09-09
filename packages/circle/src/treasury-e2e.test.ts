import { describe, expect, it } from "vitest";
import { LIVE_FALLBACK_ADDRESSES, LIVE_TREASURY_ADDRESS, TREASURER_NAME } from "./fund.js";
import {
  DEFAULT_LOAN_USDC_6,
  DEFAULT_TERM_SECONDS,
  DEPOSIT_USDC_6,
  EXPECTED_GRACE_SECONDS,
  MAX_STEP_USDC_6,
  MERCHANT_ENS_NAME,
  MERCHANT_NAME,
  REPAY_LOAN_USDC_6,
  REPAY_TERM_SECONDS,
  TREASURY_FNS,
  USDC_APPROVE_FN,
  buildTreasuryE2ePlan,
  formatTreasuryE2eStep,
  graceNote,
  plannedDefaultWaitSeconds,
  secondsUntilDefaultable,
  type TreasuryE2eSnap,
  type TreasuryLoanSnap,
} from "./treasury-e2e.js";

const TREASURY = LIVE_TREASURY_ADDRESS;
const BO = LIVE_FALLBACK_ADDRESSES.bo;

function actor(name: typeof TREASURER_NAME | typeof MERCHANT_NAME, walletId = `id-${name}`) {
  return {
    name,
    address: LIVE_FALLBACK_ADDRESSES[name],
    walletId,
  };
}

function snap(over: Partial<TreasuryE2eSnap> = {}): TreasuryE2eSnap {
  return {
    treasury: TREASURY,
    treasuryUsdc6: 3_000_000n,
    gracePeriodSeconds: EXPECTED_GRACE_SECONDS,
    nowSeconds: 1_700_000_000,
    loanCount: 0n,
    merchant: {
      ...actor("bo"),
      usdc6: 2_000_000n,
      deposit6: 0n,
      ensName: "",
    },
    treasurer: actor("ada"),
    loans: [],
    ...over,
  };
}

function loan(
  over: Partial<TreasuryLoanSnap> & Pick<TreasuryLoanSnap, "id" | "status">,
): TreasuryLoanSnap {
  return {
    borrower: BO,
    termSeconds: REPAY_TERM_SECONDS,
    dueAt: 0n,
    principal: REPAY_LOAN_USDC_6,
    principalRemaining: REPAY_LOAN_USDC_6,
    interestOwed: 0n,
    ...over,
  };
}

describe("M1.6 amounts stay in 0.2–0.5 USDC (6-dec)", () => {
  it("deposit 0.2, repay-loan 0.3, default-loan 0.2; cap 0.5; never 18-dec", () => {
    expect(DEPOSIT_USDC_6).toBe(200_000n);
    expect(REPAY_LOAN_USDC_6).toBe(300_000n);
    expect(DEFAULT_LOAN_USDC_6).toBe(200_000n);
    expect(MAX_STEP_USDC_6).toBe(500_000n);
    expect(MERCHANT_ENS_NAME).toBe("bo.botanica.eth");
    expect(MERCHANT_NAME).toBe("bo");
    expect(TREASURER_NAME).toBe("ada");
    for (const n of [DEPOSIT_USDC_6, REPAY_LOAN_USDC_6, DEFAULT_LOAN_USDC_6, MAX_STEP_USDC_6]) {
      expect(n).toBeLessThan(1_000_000n);
      expect(n.toString()).not.toMatch(/000000000000$/); // not 18-dec wei
    }
  });

  it("Circle fn sigs match TownTreasury (requestLoan takes termSeconds)", () => {
    expect(TREASURY_FNS.requestLoan).toBe("requestLoan(uint256,uint32)");
    expect(TREASURY_FNS.registerAgent).toBe("registerAgent(address,string)");
    expect(USDC_APPROVE_FN).toBe("approve(address,uint256)");
  });
});

describe("buildTreasuryE2ePlan — fresh treasury", () => {
  it("register → deposit → repay loan → default loan with 122s grace wait", () => {
    const plan = buildTreasuryE2ePlan(snap());
    expect(plan.repayLoanId).toBe(1n);
    expect(plan.defaultLoanId).toBe(2n);
    expect(plan.gracePeriodSeconds).toBe(120);
    expect(plan.graceNote).toMatch(/gracePeriodSeconds=120/);
    expect(plan.graceNote).toMatch(/waits ≈ 122s/);

    const kinds = plan.steps.map((s) => s.kind);
    expect(kinds).toEqual([
      "register-agent",
      "deposit",
      "request-loan",
      "approve-loan",
      "repay",
      "request-loan",
      "approve-loan",
      "wait-grace",
      "mark-default",
    ]);

    const reg = plan.steps[0];
    expect(reg).toMatchObject({
      kind: "register-agent",
      fromName: "ada",
      agent: BO,
      ensName: "bo.botanica.eth",
    });
    const dep = plan.steps[1];
    expect(dep).toMatchObject({ kind: "deposit", fromName: "bo", amountUsdc6: DEPOSIT_USDC_6 });
    const req1 = plan.steps[2];
    expect(req1).toMatchObject({
      kind: "request-loan",
      path: "repay",
      amountUsdc6: REPAY_LOAN_USDC_6,
      termSeconds: REPAY_TERM_SECONDS,
      loanId: 1n,
    });
    const req2 = plan.steps[5];
    expect(req2).toMatchObject({
      kind: "request-loan",
      path: "default",
      amountUsdc6: DEFAULT_LOAN_USDC_6,
      termSeconds: DEFAULT_TERM_SECONDS,
      loanId: 2n,
    });
    const wait = plan.steps[7];
    expect(wait).toMatchObject({
      kind: "wait-grace",
      waitSeconds: 122,
      gracePeriodSeconds: 120,
      termSeconds: 1,
    });
  });

  it("dry-run strings print 6-dec base units and grace=120s", () => {
    const plan = buildTreasuryE2ePlan(snap());
    const lines = plan.steps.map(formatTreasuryE2eStep).join("\n");
    expect(lines).toContain("200000 (0.2 USDC)");
    expect(lines).toContain("300000 (0.3 USDC)");
    expect(lines).toContain("term=3600s");
    expect(lines).toContain("term=1s");
    expect(lines).toContain("grace=120s");
    expect(lines).toContain("wait ≈ 122s");
    expect(lines).toContain("bo.botanica.eth");
    expect(lines).not.toContain("wei");
    expect(lines).not.toMatch(/1\d{17}/);
  });
});

describe("buildTreasuryE2ePlan — idempotent resume", () => {
  it("skips register+deposit when already done; continues from Active repay loan", () => {
    const plan = buildTreasuryE2ePlan(
      snap({
        loanCount: 1n,
        merchant: {
          ...actor("bo"),
          usdc6: 2_100_000n,
          deposit6: DEPOSIT_USDC_6,
          ensName: MERCHANT_ENS_NAME,
        },
        loans: [loan({ id: 1n, status: 2, dueAt: 1_700_000_010n })],
      }),
    );
    expect(plan.repayLoanId).toBe(1n);
    expect(plan.defaultLoanId).toBe(2n);
    const kinds = plan.steps.filter((s) => s.kind !== "skip").map((s) => s.kind);
    expect(kinds).toEqual(["repay", "request-loan", "approve-loan", "wait-grace", "mark-default"]);
  });

  it("all-done (repaid + defaulted) is skip-only", () => {
    const plan = buildTreasuryE2ePlan(
      snap({
        loanCount: 2n,
        merchant: {
          ...actor("bo"),
          usdc6: 2_000_000n,
          deposit6: DEPOSIT_USDC_6,
          ensName: MERCHANT_ENS_NAME,
        },
        loans: [
          loan({ id: 1n, status: 3, principalRemaining: 0n }),
          loan({
            id: 2n,
            status: 5,
            principal: DEFAULT_LOAN_USDC_6,
            termSeconds: DEFAULT_TERM_SECONDS,
            principalRemaining: 0n,
          }),
        ],
      }),
    );
    expect(plan.steps.every((s) => s.kind === "skip")).toBe(true);
  });

  it("Active default loan past grace → wait 0 then markDefault", () => {
    const now = 1_700_000_200;
    const dueAt = BigInt(now - 200);
    const plan = buildTreasuryE2ePlan(
      snap({
        nowSeconds: now,
        loanCount: 2n,
        merchant: {
          ...actor("bo"),
          usdc6: 2_000_000n,
          deposit6: DEPOSIT_USDC_6,
          ensName: MERCHANT_ENS_NAME,
        },
        loans: [
          loan({ id: 1n, status: 3, principalRemaining: 0n }),
          loan({
            id: 2n,
            status: 2,
            principal: DEFAULT_LOAN_USDC_6,
            termSeconds: DEFAULT_TERM_SECONDS,
            dueAt,
          }),
        ],
      }),
    );
    const wait = plan.steps.find((s) => s.kind === "wait-grace");
    expect(wait).toMatchObject({ kind: "wait-grace", waitSeconds: 0 });
    expect(plan.steps.some((s) => s.kind === "mark-default")).toBe(true);
  });
});

describe("guards", () => {
  it("throws on unrelated Pending loan so we do not mix flows", () => {
    expect(() =>
      buildTreasuryE2ePlan(
        snap({
          loanCount: 1n,
          loans: [loan({ id: 1n, status: 1, principal: 999_999n, termSeconds: 99 })],
        }),
      ),
    ).toThrow(/unrelated loan 1/);
  });

  it("throws when treasury cannot cover the 0.3 USDC repay loan", () => {
    expect(() =>
      buildTreasuryE2ePlan(
        snap({
          treasuryUsdc6: 0n,
          merchant: {
            ...actor("bo"),
            usdc6: 2_000_000n,
            deposit6: DEPOSIT_USDC_6,
            ensName: MERCHANT_ENS_NAME,
          },
        }),
      ),
    ).toThrow(/InsufficientLiquidity/);
  });

  it("throws without Circle wallet ids", () => {
    expect(() =>
      buildTreasuryE2ePlan(snap({ treasurer: { ...actor("ada"), walletId: "" } })),
    ).toThrow(/walletId/);
  });
});

describe("grace helpers", () => {
  it("120s grace + 1s term → 122s wait after approve; already-due Active loan can be 0", () => {
    expect(plannedDefaultWaitSeconds(DEFAULT_TERM_SECONDS, EXPECTED_GRACE_SECONDS)).toBe(122);
    expect(secondsUntilDefaultable(100n, 120, 221)).toBe(0);
    expect(secondsUntilDefaultable(100n, 120, 220)).toBe(1);
    expect(graceNote(120)).toMatch(/deploy default/);
    expect(graceNote(0)).not.toMatch(/deploy default/);
    expect(graceNote(0)).toMatch(/waits ≈ 2s/);
  });
});
