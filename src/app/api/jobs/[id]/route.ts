import { ApiError, readJson, route } from "@/server/api";
import { applyOverview } from "@/server/apply/apply";
import { Application, Job } from "@/server/db/models";
import { qualifies } from "@/server/matching/heuristic";
import { getSettings } from "@/server/settings";
import { markApplied, transition } from "@/server/tracking/applications";
import { StatusPatch } from "@/server/validation";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const job = await Job.findById(id).lean();
  if (!job) throw new ApiError(404, "Job not found.");
  const app = await Application.findOne({ jobId: job._id }).lean();
  // File paths stay on the server; the client only needs the version numbers.
  const { resumeFiles = [], ...rest } = app ?? {};
  return {
    job,
    application: app ? { ...rest, resumeVersions: resumeFiles.map((f) => f.version) } : null,
    overview: await applyOverview(job, app),
    eligibility: job.match ? qualifies(job, job.match, await getSettings()) : { ok: false, reasons: [] },
  };
});

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const { status, note, via } = await readJson(req, StatusPatch);
  const job = status === "applied" ? await markApplied(id, via || "manual", note) : await transition(id, status, note);
  return { status: job.status };
});
