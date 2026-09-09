// Matchstick tests for M3.2 handlers: AgentRegistered, LoanApproved, JobCompleted.

import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  afterEach,
  assert,
  clearStore,
  describe,
  newMockEvent,
  test,
} from "matchstick-as/assembly/index";
import { JobCompleted, JobCreated, JobFunded } from "../generated/AgenticCommerce/AgenticCommerce";
import {
  AgentRegistered,
  Funded,
  LoanApproved,
  LoanRequested,
} from "../generated/TownTreasury/TownTreasury";
import { handleJobCompleted, handleJobCreated, handleJobFunded } from "../src/jobs";
import {
  handleAgentRegistered,
  handleFunded,
  handleLoanApproved,
  handleLoanRequested,
} from "../src/treasury";

const AGENT = Address.fromString("0x00000000000000000000000000000000000000aa");
const CLIENT = Address.fromString("0x00000000000000000000000000000000000000bb");
const PROVIDER = Address.fromString("0x00000000000000000000000000000000000000cc");
const FUNDER = Address.fromString("0x00000000000000000000000000000000000000dd");
const TREASURY = Address.fromString("0x0000000000000000000000000000000000000001");
const ZERO32 = Bytes.fromHexString(
  "0x0000000000000000000000000000000000000000000000000000000000000000",
);

afterEach(() => {
  clearStore();
});

function withLogIndex(event: ethereum.Event, logIndex: i32): void {
  event.logIndex = BigInt.fromI32(logIndex);
  event.address = TREASURY;
}

describe("handleAgentRegistered", () => {
  test("writes ensName", () => {
    let event = changetype<AgentRegistered>(newMockEvent());
    withLogIndex(event, 1);
    event.parameters = [
      new ethereum.EventParam("agent", ethereum.Value.fromAddress(AGENT)),
      new ethereum.EventParam("ensName", ethereum.Value.fromString("alice.botanica.eth")),
    ];
    handleAgentRegistered(event);
    assert.fieldEquals("Agent", AGENT.toHexString(), "ensName", "alice.botanica.eth");
  });
});

describe("handleLoanApproved", () => {
  test("status approved, loansTaken 1, snapshot outstanding", () => {
    let funded = changetype<Funded>(newMockEvent());
    withLogIndex(funded, 1);
    funded.parameters = [
      new ethereum.EventParam("from", ethereum.Value.fromAddress(FUNDER)),
      new ethereum.EventParam(
        "amount",
        ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(10000000)),
      ),
    ];
    handleFunded(funded);

    let requested = changetype<LoanRequested>(newMockEvent());
    withLogIndex(requested, 2);
    requested.parameters = [
      new ethereum.EventParam("loanId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))),
      new ethereum.EventParam("borrower", ethereum.Value.fromAddress(AGENT)),
      new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1000000))),
      new ethereum.EventParam(
        "termSeconds",
        ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(86400)),
      ),
    ];
    handleLoanRequested(requested);

    let approved = changetype<LoanApproved>(newMockEvent());
    withLogIndex(approved, 3);
    approved.parameters = [
      new ethereum.EventParam("loanId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))),
      new ethereum.EventParam("borrower", ethereum.Value.fromAddress(AGENT)),
      new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1000000))),
      new ethereum.EventParam("rateBps", ethereum.Value.fromI32(500)),
      new ethereum.EventParam("dueAt", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(86400))),
    ];
    handleLoanApproved(approved);

    assert.fieldEquals("Loan", "1", "status", "approved");
    assert.fieldEquals("Agent", AGENT.toHexString(), "loansTaken", "1");
    assert.fieldEquals("TreasuryState", "treasury", "outstanding", "1000000");
    let snapId = approved.transaction.hash.concatI32(approved.logIndex.toI32()).toHexString();
    assert.fieldEquals("TreasurySnapshot", snapId, "outstanding", "1000000");
  });
});

describe("handleJobCompleted", () => {
  test("status completed and job_pay plus TownStat volume", () => {
    let created = changetype<JobCreated>(newMockEvent());
    withLogIndex(created, 1);
    created.parameters = [
      new ethereum.EventParam("jobId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(7))),
      new ethereum.EventParam("client", ethereum.Value.fromAddress(CLIENT)),
      new ethereum.EventParam("provider", ethereum.Value.fromAddress(PROVIDER)),
      new ethereum.EventParam("evaluator", ethereum.Value.fromAddress(CLIENT)),
      new ethereum.EventParam("expiredAt", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(999))),
      new ethereum.EventParam("hook", ethereum.Value.fromAddress(Address.zero())),
    ];
    handleJobCreated(created);

    let funded = changetype<JobFunded>(newMockEvent());
    withLogIndex(funded, 2);
    funded.parameters = [
      new ethereum.EventParam("jobId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(7))),
      new ethereum.EventParam("client", ethereum.Value.fromAddress(CLIENT)),
      new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(250000))),
    ];
    handleJobFunded(funded);

    let completed = changetype<JobCompleted>(newMockEvent());
    withLogIndex(completed, 3);
    completed.parameters = [
      new ethereum.EventParam("jobId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(7))),
      new ethereum.EventParam("evaluator", ethereum.Value.fromAddress(CLIENT)),
      new ethereum.EventParam("reason", ethereum.Value.fromFixedBytes(ZERO32)),
    ];
    handleJobCompleted(completed);

    assert.fieldEquals("Job", "7", "status", "completed");
    let payId = completed.transaction.hash.concatI32(completed.logIndex.toI32()).toHexString();
    assert.fieldEquals("Payment", payId, "kind", "job_pay");
    let statId = (
      completed.block.timestamp.toI64() * 1000000 +
      completed.logIndex.toI64()
    ).toString();
    assert.fieldEquals("TownStat", statId, "volume", "250000");
  });
});
