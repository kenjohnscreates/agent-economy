import { describe, expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  toHex,
  zeroAddress,
  type Hex,
} from "viem";
import type { CircleClient } from "./client.js";
import { DEFAULT_FEE } from "./execute.js";
import {
  AGENTIC_ABI_PATH,
  COMPLETE_REASON,
  DEFAULT_MERCHANT_NAME,
  DEFAULT_WORKER_NAME,
  DELIVERABLE_HASH,
  EMPTY_BYTES,
  JOB_AMOUNT_USDC_6,
  JOB_ID_PLACEHOLDER,
  USDC_APPROVE_SIGNATURE,
  ZERO_HOOK,
  abiFunctionSignature,
  buildJobPlan,
  executeJobE2e,
  formatJobPlan,
  jobIdFromLogs,
  loadAgenticAbi,
  resolveJobsAddress,
  substJobId,
  toExecuteInput,
} from "./job.js";
import type { RosterWallet } from "./roster.js";

const merchant: RosterWallet = {
  name: "bo",
  walletId: "w-bo",
  address: "0x337512e3f78e9ad91493a98143b511c46c3775f7",
};
const worker: RosterWallet = {
  name: "dee",
  walletId: "w-dee",
  address: "0x70b1300425c37af893ca4841e4183e7f0a1bdb89",
};

const expiredAt = 1_800_000_000n;

function plan() {
  return buildJobPlan({ merchant, worker, expiredAt });
}

describe("AgenticCommerce ABI", () => {
  it("loads packages/subgraph/abis/AgenticCommerce.json and names the 4 lifecycle fns", () => {
    expect(AGENTIC_ABI_PATH).toMatch(/packages\/subgraph\/abis\/AgenticCommerce\.json$/);
    const abi = loadAgenticAbi();
    expect(abiFunctionSignature(abi, "createJob")).toBe(
      "createJob(address,address,uint256,string,address)",
    );
    expect(abiFunctionSignature(abi, "setBudget")).toBe("setBudget(uint256,uint256,bytes)");
    expect(abiFunctionSignature(abi, "fund")).toBe("fund(uint256,bytes)");
    expect(abiFunctionSignature(abi, "submit")).toBe("submit(uint256,bytes32,bytes)");
    expect(abiFunctionSignature(abi, "complete")).toBe("complete(uint256,bytes32,bytes)");
  });
});

describe("buildJobPlan — 4-stage ARCHITECTURE §4.2 flow", () => {
  it("defaults bo→dee, 0.5 USDC (500000 base), hook=0x0, MEDIUM fee inputs", () => {
    const p = plan();
    expect(DEFAULT_MERCHANT_NAME).toBe("bo");
    expect(DEFAULT_WORKER_NAME).toBe("dee");
    expect(p.amountUsdc6).toBe(500_000n);
    expect(JOB_AMOUNT_USDC_6).toBe(500_000n);
    expect(p.merchant.name).toBe("bo");
    expect(p.worker.name).toBe("dee");
    expect(p.hook).toBe(ZERO_HOOK);
    expect(p.hook).toBe(zeroAddress);
    expect(p.calls).toHaveLength(6);
    expect(p.calls.map((c) => c.stage)).toEqual([1, 2, 2, 2, 3, 4]);
    expect(p.calls.map((c) => c.kind)).toEqual([
      "createJob",
      "setBudget",
      "approve",
      "fund",
      "submit",
      "complete",
    ]);
    const create = p.calls[0]!;
    expect(create.abiParameters).toEqual([
      worker.address,
      merchant.address,
      expiredAt.toString(),
      p.description,
      ZERO_HOOK,
    ]);
    expect(create.fromName).toBe("bo");
    expect(p.calls.find((c) => c.kind === "setBudget")?.fromName).toBe("dee");
    expect(p.calls.find((c) => c.kind === "approve")?.abiFunctionSignature).toBe(
      USDC_APPROVE_SIGNATURE,
    );
    expect(p.calls.find((c) => c.kind === "approve")?.abiParameters).toEqual([p.jobs, "500000"]);
    expect(p.calls.find((c) => c.kind === "fund")?.abiParameters).toEqual([
      JOB_ID_PLACEHOLDER,
      EMPTY_BYTES,
    ]);
    expect(p.calls.find((c) => c.kind === "submit")?.abiParameters[1]).toBe(DELIVERABLE_HASH);
    expect(p.calls.find((c) => c.kind === "complete")?.abiParameters[1]).toBe(COMPLETE_REASON);
  });

  it("dry-run formatter prints exactly 4 numbered calls and 6-dec amount", () => {
    const lines = formatJobPlan(plan());
    const numbered = lines.filter((l) => /^\s+\d+\. /.test(l));
    expect(numbered).toHaveLength(4);
    expect(numbered[0]).toMatch(/createJob\(provider=dee, evaluator=bo/);
    expect(numbered[1]).toMatch(/fund escrow 500000 \(0\.5 USDC\)/);
    expect(numbered[2]).toMatch(/submit\(deliverableHash=0x/);
    expect(numbered[3]).toMatch(/complete\(reason=0x/);
    expect(lines.join("\n")).toMatch(/feeLevel MEDIUM/);
    expect(lines.join("\n")).toMatch(/never absoluteFee/);
    expect(lines.join("\n")).not.toMatch(/1e18|1000000000000|absoluteFee\(/);
  });

  it("toExecuteInput always uses DEFAULT_FEE MEDIUM, never type absolute", () => {
    for (const c of plan().calls) {
      const input = toExecuteInput(c, "00000000-0000-4000-8000-000000000001");
      expect(input.fee).toEqual(DEFAULT_FEE);
      expect(input.fee).toEqual({ type: "level", config: { feeLevel: "MEDIUM" } });
      expect(input.fee).not.toMatchObject({ type: "absolute" });
      expect(input.idempotencyKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    }
  });

  it("rejects same merchant/worker and zero amount; substJobId fills placeholder", () => {
    expect(() => buildJobPlan({ merchant, worker: merchant, expiredAt })).toThrow(/different/);
    expect(() => buildJobPlan({ merchant, worker, expiredAt, amountUsdc6: 0n })).toThrow(
      /positive/,
    );
    const funded = substJobId(
      plan().calls.find((c) => c.kind === "fund")!,
      "42",
    );
    expect(funded.abiParameters[0]).toBe("42");
  });

  it("resolveJobsAddress prefers env then the Arc Testnet reference", () => {
    expect(resolveJobsAddress({})).toBe("0x0747EEf0706327138c69792bF28Cd525089e4583");
    expect(resolveJobsAddress({ ERC8183_ADDRESS: "0x" + "ab".repeat(20) }).toLowerCase()).toBe(
      "0x" + "ab".repeat(20),
    );
    expect(resolveJobsAddress({ ERC8183_ADDRESS: "nope" })).toBe(
      "0x0747EEf0706327138c69792bF28Cd525089e4583",
    );
  });
});

describe("jobIdFromLogs + executeJobE2e", () => {
  it("decodes indexed JobCreated.jobId", () => {
    const abi = loadAgenticAbi();
    const topics = encodeEventTopics({
      abi,
      eventName: "JobCreated",
      args: {
        jobId: 185723n,
        client: merchant.address as Hex,
        provider: worker.address as Hex,
      },
    });
    const data = encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "address" }],
      [merchant.address as Hex, expiredAt, ZERO_HOOK],
    );
    expect(
      jobIdFromLogs([
        {
          address: "0x0747EEf0706327138c69792bF28Cd525089e4583",
          data,
          topics,
        } as never,
      ]),
    ).toBe(185723n);
  });

  it("live path: 6 executeContract calls, 4 lifecycle hashes, jobId substituted", async () => {
    const hashes: string[] = [];
    const execute = vi.fn(async (_c: CircleClient, input: ReturnType<typeof toExecuteInput>) => {
      expect(input.fee).toEqual(DEFAULT_FEE);
      expect(input.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
      if (hashes.length > 0) {
        expect(JSON.stringify(input.abiParameters)).not.toContain(JOB_ID_PLACEHOLDER);
      }
      return { txId: `tx-${hashes.length}`, state: "INITIATED" };
    });
    const waitComplete = vi.fn(async (_c: CircleClient, txId: string) => {
      const hash = `0x${"ab".repeat(32).slice(0, 62)}${hashes.length}` as Hex;
      hashes.push(hash);
      return { id: txId, state: "COMPLETE" as const, txHash: hash };
    });
    const uuid = vi.fn(() => "11111111-1111-4111-8111-111111111111");
    const r = await executeJobE2e({} as CircleClient, plan(), {
      executeContract: execute as never,
      waitComplete: waitComplete as never,
      jobIdFromTxHash: async () => "99",
      uuid,
    });
    expect(execute).toHaveBeenCalledTimes(6);
    expect(uuid).toHaveBeenCalledTimes(6);
    expect(r.jobId).toBe("99");
    expect(r.lifecycleHashes).toHaveLength(4);
    expect(r.txHashes.createJob).toBeTruthy();
    expect(r.txHashes.setBudget).toBeTruthy();
    expect(r.txHashes.approve).toBeTruthy();
    expect(r.txHashes.fund).toBeTruthy();
    expect(r.txHashes.submit).toBeTruthy();
    expect(r.txHashes.complete).toBeTruthy();
    const fundCall = execute.mock.calls[3]![1];
    expect(fundCall.abiFunctionSignature).toBe("fund(uint256,bytes)");
    expect(fundCall.abiParameters[0]).toBe("99");
  });
});

describe("deliverable hash is bytes32 not utf8", () => {
  it("keccak256 hex, 66 chars", () => {
    expect(DELIVERABLE_HASH).toBe(keccak256(toHex("agent-town/m1.5/deliverable")));
    expect(DELIVERABLE_HASH).toMatch(/^0x[0-9a-f]{64}$/);
    expect(COMPLETE_REASON).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
