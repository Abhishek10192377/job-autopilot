import { Job, type IJob } from "../db/models";
import { scoreJob, qualifies } from "../matching/heuristic";
import { getProfile } from "../profile/profile";
import { getSettings } from "../settings";
import { logActivity } from "../tracking/activity";
import { enrich } from "./enrich";

export interface ManualJobInput {
  url: string;
  title: string;
  company: string;
  location?: string;
  workMode?: "remote" | "hybrid" | "onsite" | "unknown";
  description?: string;
}

/**
 * Add a posting the user found themselves (e.g. on LinkedIn or Naukri, which are not fetched automatically).
 * It is scored and tracked like any other job; the same duplicate rules apply.
 */
export async function addManualJob(input: ManualJobInput): Promise<{ job: IJob; created: boolean }> {
  const job = enrich({
    source: "manual",
    sourceId: input.url,
    title: input.title,
    company: input.company,
    url: input.url,
    location: input.location,
    remote: input.workMode === "remote" ? true : input.workMode === "onsite" ? false : null,
    tags: input.workMode === "hybrid" ? ["hybrid"] : [],
    descriptionText: input.description,
    attribution: "Added manually",
  });
  const existing = await Job.findOne({ $or: [{ urlKey: job.urlKey }, { dedupeKey: job.dedupeKey }] }).lean();
  if (existing) return { job: existing, created: false };

  const settings = await getSettings();
  const now = new Date();
  const match = scoreJob(job, await getProfile(), settings, now);
  const status = qualifies(job, match, settings).ok ? "matched" : "discovered";
  const doc = await Job.create({
    ...job,
    sources: [{ source: "manual", url: job.url }],
    discoveredAt: now,
    lastSeenAt: now,
    match,
    heuristicMatch: match,
    status,
    statusHistory: [{ status, at: now, note: `Added manually; scored ${match.total}/100 (heuristic)` }],
  });
  await logActivity("manual", `Added ${job.title} at ${job.company} manually (scored ${match.total}/100).`, { jobId: doc._id });
  return { job: doc.toObject(), created: true };
}
