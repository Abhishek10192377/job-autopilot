import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, rateLimit, readJson } from "@/middlewares/apiHandler";
import { Application, Job } from "@/models";
import { applyOverview, requestApproval, sendEmailApplication } from "@/services/apply/apply";
import { assistedAutofill } from "@/services/apply/autofill";
import { addManualJob } from "@/services/discovery/manual";
import { prepareApplication, updateMaterials } from "@/services/documents/prepare";
import { renderLetterPdf } from "@/services/documents/render";
import { listJobs } from "@/services/jobService";
import { qualifies } from "@/services/matching/heuristic";
import { aiMatchJob, rescoreHeuristic } from "@/services/matching/match";
import { getProfile } from "@/services/profile/profile";
import { getSettings } from "@/services/settingsService";
import { markApplied, transition } from "@/services/tracking/applications";
import { ManualJob, MaterialsInput, StatusPatch, TrackingPatch } from "@/validators";

type IdParams = { id: string };

/** GET /api/jobs */
export async function getJobs(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  return listJobs({ ...Object.fromEntries(q), salary: q.get("salary") === "1" });
}

/** POST /api/jobs: add a job by hand. */
export async function createJob(req: NextRequest) {
  const { job, created } = await addManualJob(await readJson(req, ManualJob));
  if (!created) throw new ApiError(409, `This job is already tracked: "${job.title}" at ${job.company}.`, { jobId: String(job._id) });
  return { jobId: String(job._id) };
}

/** GET /api/jobs/:id */
export async function getJob(_req: NextRequest, { id }: IdParams) {
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
}

/** PATCH /api/jobs/:id: change the job's status. */
export async function updateJobStatus(req: NextRequest, { id }: IdParams) {
  const { status, note, via } = await readJson(req, StatusPatch);
  const job = status === "applied" ? await markApplied(id, via || "manual", note) : await transition(id, status, note);
  return { status: job.status };
}

const ActionBody = z.object({
  action: z.enum(["rescore", "ai-match", "prepare", "request-approval", "send-email", "autofill"]),
  useAi: z.boolean().optional(),
  /** Recipient for "send-email"; defaults to the address in the posting. */
  to: z.email().optional(),
});

/** POST /api/jobs/:id/actions */
export async function runJobAction(req: NextRequest, { id }: IdParams) {
  const { action, useAi, to } = await readJson(req, ActionBody);
  switch (action) {
    case "rescore":
      return { message: `Re-scored: ${(await rescoreHeuristic(id))?.total ?? "?"}/100.` };
    case "ai-match":
      rateLimit("ai", 20, 60_000);
      return { message: `AI analysis: ${(await aiMatchJob(id)).total}/100.` };
    case "prepare": {
      rateLimit("ai", 20, 60_000);
      const app = await prepareApplication(id, { useAi });
      return { message: `Application prepared (${app.generatedBy === "ai" ? "AI-tailored" : "template"}), resume v${app.resumeVersion}.` };
    }
    case "request-approval":
      await requestApproval(id);
      return { message: "Moved to Awaiting approval." };
    case "send-email": {
      rateLimit("send-email", 10, 3_600_000);
      const job = await sendEmailApplication(id, "approved", to);
      return { message: `Application emailed to ${to ?? job.applyEmail}.` };
    }
    case "autofill":
      rateLimit("autofill", 6, 60_000);
      return assistedAutofill(id);
  }
}

const FILE_TYPES = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

function download(data: Uint8Array, name: string, type: string) {
  return new Response(new Uint8Array(data), { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}

/** GET /api/jobs/:id/files?doc=resume&format=pdf|docx[&version=N]  or  ?doc=letter */
export async function downloadJobFile(req: NextRequest, { id }: IdParams) {
  const q = req.nextUrl.searchParams;
  const app = await Application.findOne({ jobId: id }).lean();
  if (!app?.materials) throw new ApiError(404, "No prepared materials for this job.");
  if (q.get("doc") === "letter") {
    const profile = await getProfile();
    return download(await renderLetterPdf(profile, app.materials.coverLetter), `${profile.name.replace(/[^a-z0-9]+/gi, "_")}_Cover_Letter.pdf`, FILE_TYPES.pdf);
  }
  const format = q.get("format") === "docx" ? "docx" : "pdf";
  const version = Number(q.get("version")) || app.resumeVersion;
  const entry = app.resumeFiles.find((f) => f.version === version);
  if (!entry) throw new ApiError(404, `Resume version ${version} not found.`);
  try {
    return download(await readFile(entry[format]), path.basename(entry[format]), FILE_TYPES[format]);
  } catch {
    throw new ApiError(404, "The saved file is missing from data/private — prepare the application again.");
  }
}

/** PUT /api/jobs/:id/materials */
export async function updateJobMaterials(req: NextRequest, { id }: IdParams) {
  const app = await updateMaterials(id, await readJson(req, MaterialsInput));
  return { resumeVersion: app.resumeVersion, truthWarnings: app.truthWarnings };
}

/** PATCH /api/jobs/:id/tracking */
export async function updateJobTracking(req: NextRequest, { id }: IdParams) {
  const patch = await readJson(req, TrackingPatch);
  const job = await Job.findById(id, { _id: 1 }).lean();
  if (!job) throw new ApiError(404, "Job not found.");
  // A changed follow-up date should produce a fresh reminder.
  const set = { ...patch, ...("followUpDate" in patch ? { followUpNotifiedAt: null } : {}) };
  await Application.updateOne(
    { jobId: job._id },
    { $set: set, $setOnInsert: { materials: null, resumeVersion: 0, generatedBy: "template", preparedAt: new Date(), truthWarnings: [] } },
    { upsert: true },
  );
  return { ok: true };
}
