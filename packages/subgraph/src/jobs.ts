// ERC-8183 AgenticCommerce job handlers. Business logic lands in M3.2.
// Inputs: job lifecycle events (create/fund/submit/complete/reject/expire).
// Outputs: Agent, Job, Payment, TownStat (empty until M3.2). Do not index ERC-20 Transfer.

import {
  JobCompleted,
  JobCreated,
  JobExpired,
  JobFunded,
  JobRejected,
  JobSubmitted,
} from "../generated/AgenticCommerce/AgenticCommerce";

export function handleJobCreated(_event: JobCreated): void {}

export function handleJobFunded(_event: JobFunded): void {}

export function handleJobSubmitted(_event: JobSubmitted): void {}

export function handleJobCompleted(_event: JobCompleted): void {}

export function handleJobRejected(_event: JobRejected): void {}

export function handleJobExpired(_event: JobExpired): void {}
