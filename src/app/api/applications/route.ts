import { route } from "@/server/api";
import { Application, Job } from "@/server/db/models";

export const GET = route(async () => {
  const apps = await Application.find({}, { materials: 0, automationLog: 0, resumeFiles: 0 }).sort({ appliedAt: -1, preparedAt: -1 }).limit(500).lean();
  const jobs = await Job.find({ _id: { $in: apps.map((a) => a.jobId) } }, { title: 1, company: 1, location: 1, status: 1, url: 1, source: 1, workMode: 1, "match.total": 1 }).lean();
  const byId = new Map(jobs.map((j) => [String(j._id), j]));
  return { items: apps.flatMap((a) => (byId.has(String(a.jobId)) ? [{ ...a, job: byId.get(String(a.jobId)) }] : [])) };
});
