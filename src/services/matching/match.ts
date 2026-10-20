import type { Types } from "mongoose";
import type { JobStatus, MatchResult } from "@/types";
import { Job, type IJob } from "../../models";
import { getProfile } from "../profile/profile";
import { getSettings } from "../settingsService";
import { logActivity } from "../tracking/activity";
import { aiScoreJob } from "./ai";
import { qualifies, scoreJob } from "./heuristic";

/** Scoring only ever moves a job between Discovered and Matched; later stages are the user's decisions. */
export function statusAfterScoring(current: JobStatus, qualified: boolean): JobStatus {
  if (current !== "discovered" && current !== "matched") return current;
  return qualified ? "matched" : "discovered";
}

async function applyMatch(job: IJob, match: MatchResult, extra: Partial<IJob> = {}) {
  const settings = await getSettings();
  const next = statusAfterScoring(job.status, qualifies(job, match, settings).ok);
  const update: Record<string, unknown> = { match, ...extra };
  if (next !== job.status) update.status = next;
  await Job.updateOne(
    { _id: job._id },
    { $set: update, ...(next !== job.status ? { $push: { statusHistory: { status: next, at: new Date(), note: `Scored ${match.total}/100 (${match.engine})` } } } : {}) },
  );
  return match;
}

/** Re-run the rule-based score (e.g. after settings or profile change). Keeps an existing AI score in place. */
export async function rescoreHeuristic(jobId: Types.ObjectId | string): Promise<MatchResult | null> {
  const job = await Job.findById(jobId).lean();
  if (!job) return null;
  const match = scoreJob(job, await getProfile(), await getSettings());
  if (job.match?.engine === "ai") {
    await Job.updateOne({ _id: job._id }, { $set: { heuristicMatch: match } });
    return job.match;
  }
  return applyMatch(job, match, { heuristicMatch: match });
}

/** AI analysis of one job. The rule-based score is kept alongside for comparison. */
export async function aiMatchJob(jobId: Types.ObjectId | string): Promise<MatchResult> {
  const job = await Job.findById(jobId).lean();
  if (!job) throw new Error("Job not found.");
  const match = await aiScoreJob(job, await getProfile(), await getSettings());
  await applyMatch(job, match);
  await logActivity("match", `AI analysis: ${job.title} at ${job.company} scored ${match.total}/100.`, { jobId: job._id });
  return match;
}

export async function rescoreAll(): Promise<number> {
  const ids = await Job.find({}, { _id: 1 }).lean();
  for (const { _id } of ids) await rescoreHeuristic(_id);
  return ids.length;
}
