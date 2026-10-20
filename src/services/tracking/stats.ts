import type { Stats } from "@/types";
import { Application, Job } from "../../models";

export async function getStats(): Promise<Stats> {
  const [byStatus, matching, prepared, submitted, interviews] = await Promise.all([
    Job.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    // Jobs that met the eligibility criteria (or that you chose to pursue anyway).
    Job.countDocuments({ status: { $nin: ["discovered", "skipped"] } }),
    Application.countDocuments({ resumeVersion: { $gt: 0 } }),
    Application.countDocuments({ appliedAt: { $ne: null } }),
    Application.countDocuments({ appliedAt: { $ne: null }, $or: [{ interviewDate: { $ne: null } }] }),
  ]);
  const count = (s: string) => byStatus.find((b) => b._id === s)?.n ?? 0;
  const total = byStatus.reduce((a, b) => a + b.n, 0);
  // An interview counts whether it is recorded by status or by an interview date.
  const interviewed = Math.max(interviews, count("interview") + count("offer"));
  return {
    discovered: total,
    matching,
    prepared,
    submitted,
    interviews: interviewed,
    rejected: count("rejected"),
    saved: count("saved"),
    offers: count("offer"),
    awaitingApproval: count("awaiting_approval"),
    // Share of submitted applications that led to an interview or offer; null until something is submitted.
    successRate: submitted ? Math.round((interviewed / submitted) * 100) : null,
  };
}
