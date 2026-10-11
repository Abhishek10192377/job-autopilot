import { ApiError, readJson, route } from "@/server/api";
import { addManualJob } from "@/server/discovery/manual";
import { listJobs } from "@/server/jobs/list";
import { ManualJob } from "@/server/validation";

export const GET = route(async (req) => {
  const q = req.nextUrl.searchParams;
  return listJobs({ ...Object.fromEntries(q), salary: q.get("salary") === "1" });
});

export const POST = route(async (req) => {
  const { job, created } = await addManualJob(await readJson(req, ManualJob));
  if (!created) throw new ApiError(409, `This job is already tracked: "${job.title}" at ${job.company}.`, { jobId: String(job._id) });
  return { jobId: String(job._id) };
});
