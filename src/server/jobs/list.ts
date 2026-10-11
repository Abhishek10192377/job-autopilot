import type { FilterQuery, SortOrder } from "mongoose";
import { STATUSES, type JobQuery, type JobStatus } from "@/shared/types";
import { Job, type IJob } from "../db/models";
import { escapeRegExp } from "../lib/text";

const SORTS: Record<string, Record<string, SortOrder>> = {
  score: { "match.total": -1, discoveredAt: -1 },
  newest: { discoveredAt: -1 },
  company: { company: 1, title: 1 },
  experience: { experienceMin: 1, "match.total": -1 },
};

/** The filtered, paginated job list. Used by both GET /api/jobs and the getJobs server action. */
export async function listJobs(q: JobQuery = {}) {
  const like = (v: string) => new RegExp(escapeRegExp(v.slice(0, 80)), "i");
  const filter: FilterQuery<IJob> = {};
  const and: FilterQuery<IJob>[] = [];
  if (q.title) filter.title = like(q.title);
  if (q.company) filter.company = like(q.company);
  if (q.location) filter.location = like(q.location);
  if (q.source) filter.source = q.source;
  if (["remote", "hybrid", "onsite", "unknown"].includes(q.workMode ?? "")) filter.workMode = q.workMode;
  const status = q.status || "open";
  if (status === "open") filter.status = { $in: ["discovered", "matched", "saved", "prepared", "awaiting_approval"] };
  else if (status !== "all") filter.status = { $in: status.split(",").filter((s): s is JobStatus => (STATUSES as readonly string[]).includes(s)) };
  const minScore = Number(q.minScore);
  if (minScore > 0) filter["match.total"] = { $gte: minScore };
  // An unpublished requirement is unknown, not a mismatch, so those jobs stay in the list.
  if (q.maxExp !== undefined && q.maxExp !== "") and.push({ $or: [{ experienceMin: null }, { experienceMin: { $lte: Number(q.maxExp) } }] });
  if (q.salary) and.push({ $or: [{ "salary.min": { $gt: 0 } }, { "salary.max": { $gt: 0 } }, { "salary.raw": { $exists: true, $ne: "" } }] });
  if (and.length) filter.$and = and;

  const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 25));
  const page = Math.max(0, Number(q.page) || 0);
  const [items, total] = await Promise.all([
    Job.find(filter, { description: 0, statusHistory: 0, heuristicMatch: 0 })
      .sort(SORTS[q.sort ?? "score"] ?? SORTS.score)
      .skip(page * pageSize)
      .limit(pageSize)
      .lean(),
    Job.countDocuments(filter),
  ]);
  return { items, total, page, pageSize };
}
