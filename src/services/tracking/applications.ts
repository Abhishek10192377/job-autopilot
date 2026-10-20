import type { Types } from "mongoose";
import { canTransition, isSubmitted, SUBMITTED_STATUSES } from "@/utils/status";
import { STATUS_LABEL, type JobStatus } from "@/types";
import { Application, Job, type IJob } from "../../models";
import { getSettings } from "../settingsService";
import { logActivity } from "./activity";

export class TrackingError extends Error {
  constructor(
    message: string,
    public code: "not_found" | "invalid_transition" | "duplicate" | "not_prepared",
  ) {
    super(message);
  }
}

type Id = Types.ObjectId | string;

/**
 * Another listing for the same company + role that has already been applied to.
 * This is what stops the same job being applied to twice via two different boards.
 */
export async function findDuplicateApplication(job: Pick<IJob, "_id" | "dedupeKey">): Promise<IJob | null> {
  return Job.findOne({ _id: { $ne: job._id }, dedupeKey: job.dedupeKey, status: { $in: SUBMITTED_STATUSES } }).lean();
}

export async function transition(jobId: Id, to: JobStatus, note?: string): Promise<IJob> {
  const job = await Job.findById(jobId);
  if (!job) throw new TrackingError("Job not found.", "not_found");
  if (job.status === to) return job.toObject();
  if (!canTransition(job.status, to)) {
    throw new TrackingError(`Cannot move a job from "${STATUS_LABEL[job.status]}" to "${STATUS_LABEL[to]}".`, "invalid_transition");
  }
  if ((to === "prepared" || to === "awaiting_approval") && !(await Application.exists({ jobId: job._id, materials: { $ne: null } }))) {
    throw new TrackingError("Prepare the application materials first.", "not_prepared");
  }
  job.status = to;
  job.statusHistory.push({ status: to, at: new Date(), note });
  await job.save();
  return job.toObject();
}

/** Record that an application was submitted. Refuses a second application to the same role. */
export async function markApplied(jobId: Id, via: string, note?: string): Promise<IJob> {
  const job = await Job.findById(jobId);
  if (!job) throw new TrackingError("Job not found.", "not_found");
  if (isSubmitted(job.status)) throw new TrackingError("This job is already marked as applied.", "duplicate");
  const dup = await findDuplicateApplication(job);
  if (dup) {
    throw new TrackingError(`You already applied to "${dup.title}" at ${dup.company} (found via ${dup.source}). Duplicate application blocked.`, "duplicate");
  }
  const settings = await getSettings();
  const now = new Date();
  const followUp = new Date(now.getTime() + settings.followUpDays * 86_400_000);
  // An application record exists for every applied job, even when it was applied to without prepared materials.
  await Application.updateOne(
    { jobId: job._id },
    {
      $set: { appliedAt: now, appliedVia: via, followUpDate: followUp, followUpNotifiedAt: null },
      $setOnInsert: { materials: null, resumeVersion: 0, generatedBy: "template", preparedAt: now, truthWarnings: [], notes: "", rejectionReason: "" },
      $push: { automationLog: { at: now, message: `Marked as applied (${via}).` } },
    },
    { upsert: true },
  );
  const updated = await transition(job._id, "applied", note ?? `Applied via ${via}`);
  await logActivity("applied", `Applied to ${job.title} at ${job.company} (${via}).`, { level: "success", jobId: job._id });
  return updated;
}
