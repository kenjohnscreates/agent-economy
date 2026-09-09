// ERC-8183 AgenticCommerce job handlers. Lifecycle: open→funded→submitted→completed|rejected|expired.
// Inputs: job events (create/fund/submit/complete/reject/expire). Amount from create is absent; set on fund.
// Outputs: Agent, Job, Payment (job_pay), TownStat volume. Do not index ERC-20 Transfer.

import {
  JobCompleted,
  JobCreated,
  JobExpired,
  JobFunded,
  JobRejected,
  JobSubmitted,
} from "../generated/AgenticCommerce/AgenticCommerce";
import { Job } from "../generated/schema";
import { emitTownStat, getOrCreateAgent, recordPayment, ZERO } from "./helpers";

/** New job: client/provider from event; amount 0 until JobFunded. */
export function handleJobCreated(event: JobCreated): void {
  getOrCreateAgent(event.params.client);
  getOrCreateAgent(event.params.provider);
  let job = new Job(event.params.jobId.toString());
  job.client = event.params.client;
  job.provider = event.params.provider;
  job.amount = ZERO;
  job.status = "open";
  job.createdAt = event.block.timestamp;
  job.save();
}

/** Escrow funded: status funded, amount from event. */
export function handleJobFunded(event: JobFunded): void {
  let job = Job.load(event.params.jobId.toString());
  if (job == null) {
    return;
  }
  job.amount = event.params.amount;
  job.status = "funded";
  job.save();
}

/** Provider submitted deliverable. */
export function handleJobSubmitted(event: JobSubmitted): void {
  let job = Job.load(event.params.jobId.toString());
  if (job == null) {
    return;
  }
  job.status = "submitted";
  job.save();
}

/** Settlement: GDP volume, job_pay Payment, provider earned / client spent. */
export function handleJobCompleted(event: JobCompleted): void {
  let job = Job.load(event.params.jobId.toString());
  if (job == null) {
    return;
  }
  job.status = "completed";
  job.settledAt = event.block.timestamp;
  job.save();
  let provider = getOrCreateAgent(job.provider);
  provider.jobsCompleted = provider.jobsCompleted + 1;
  provider.earned = provider.earned.plus(job.amount);
  provider.save();
  let client = getOrCreateAgent(job.client);
  client.spent = client.spent.plus(job.amount);
  client.save();
  recordPayment(event, job.client, job.provider, job.amount, "job_pay");
  emitTownStat(event, job.amount);
}

/** Evaluator rejected; terminal. */
export function handleJobRejected(event: JobRejected): void {
  let job = Job.load(event.params.jobId.toString());
  if (job == null) {
    return;
  }
  job.status = "rejected";
  job.settledAt = event.block.timestamp;
  job.save();
}

/** Job expired; terminal. */
export function handleJobExpired(event: JobExpired): void {
  let job = Job.load(event.params.jobId.toString());
  if (job == null) {
    return;
  }
  job.status = "expired";
  job.settledAt = event.block.timestamp;
  job.save();
}
