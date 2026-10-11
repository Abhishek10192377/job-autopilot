import type { JobStatus } from "./types";

// Discovered → Matched → Saved → Prepared → Awaiting Approval → Applied → Interview → Offer / Rejected.
// "Skipped" can be reached from any pre-application stage and can be restored.
const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  discovered: ["matched", "saved", "prepared", "skipped", "applied"],
  matched: ["discovered", "saved", "prepared", "skipped", "applied"],
  saved: ["prepared", "skipped", "applied", "matched"],
  prepared: ["awaiting_approval", "applied", "saved", "skipped"],
  awaiting_approval: ["applied", "prepared", "skipped"],
  applied: ["interview", "offer", "rejected"],
  interview: ["offer", "rejected"],
  offer: ["rejected"],
  rejected: [],
  skipped: ["discovered", "matched", "saved"],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: JobStatus): JobStatus[] {
  return TRANSITIONS[from];
}

/** Stages at which an application has already gone out. */
export const SUBMITTED_STATUSES: JobStatus[] = ["applied", "interview", "offer", "rejected"];

export function isSubmitted(status: JobStatus): boolean {
  return SUBMITTED_STATUSES.includes(status);
}
