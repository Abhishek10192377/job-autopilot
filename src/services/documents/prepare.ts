import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Types } from "mongoose";
import { canTransition } from "@/utils/status";
import type { Materials, Profile, TailoredResume } from "@/types";
import { env } from "../../config/env";
import { Application, Job, type IApplication } from "../../models";
import { getProfile } from "../profile/profile";
import { logActivity } from "../tracking/activity";
import { transition } from "../tracking/applications";
import { renderResumeDocx, renderResumePdf } from "./render";
import { buildMaterials, reviewMaterials } from "./tailor";

type Id = Types.ObjectId | string;

/**
 * Write a tailored resume version to disk as PDF and DOCX.
 * Each version gets its own file name; earlier versions and the original resume are never overwritten.
 */
export async function saveResumeFiles(jobId: Id, version: number, profile: Profile, resume: TailoredResume) {
  const dir = path.join(env.dataDir, "resumes", String(jobId));
  await mkdir(dir, { recursive: true });
  const base = `${profile.name.replace(/[^a-z0-9]+/gi, "_")}_Resume_v${version}`;
  const pdf = path.join(dir, `${base}.pdf`);
  const docx = path.join(dir, `${base}.docx`);
  await writeFile(pdf, await renderResumePdf(profile, resume), { flag: "wx" }).catch((e) => {
    if (e.code !== "EEXIST") throw e;
  });
  await writeFile(docx, await renderResumeDocx(profile, resume), { flag: "wx" }).catch((e) => {
    if (e.code !== "EEXIST") throw e;
  });
  return { version, pdf, docx };
}

/** Generate (or regenerate) the application pack for a job and move it to Prepared. */
export async function prepareApplication(jobId: Id, opts: { useAi?: boolean } = {}): Promise<IApplication> {
  const job = await Job.findById(jobId).lean();
  if (!job) throw new Error("Job not found.");
  const profile = await getProfile();
  const { materials, warnings, generatedBy } = await buildMaterials(job, profile, opts);

  const existing = await Application.findOne({ jobId: job._id }).lean();
  const version = (existing?.resumeVersion ?? 0) + 1;
  const files = await saveResumeFiles(job._id, version, profile, materials.resume);
  const app = await Application.findOneAndUpdate(
    { jobId: job._id },
    {
      $set: { materials, truthWarnings: warnings, generatedBy, resumeVersion: version, preparedAt: new Date() },
      $push: { resumeFiles: files, automationLog: { at: new Date(), message: `Prepared materials (${generatedBy}), resume v${version}.` } },
      $setOnInsert: { notes: "", rejectionReason: "", recruiter: {} },
    },
    { upsert: true, new: true },
  ).lean();
  if (job.status !== "prepared" && canTransition(job.status, "prepared")) await transition(job._id, "prepared", `Materials prepared (${generatedBy})`);
  await logActivity("prepared", `Prepared application for ${job.title} at ${job.company}${warnings.length ? ` (${warnings.length} note${warnings.length > 1 ? "s" : ""} to review)` : ""}.`, {
    jobId: job._id,
    level: warnings.length ? "warning" : "info",
  });
  return app!;
}

/** Save the user's edits. A changed resume becomes a new saved version. */
export async function updateMaterials(jobId: Id, materials: Materials): Promise<IApplication> {
  const app = await Application.findOne({ jobId });
  if (!app || !app.materials) throw new Error("Prepare the application first.");
  const profile = await getProfile();
  const resumeChanged = JSON.stringify(app.materials.resume) !== JSON.stringify(materials.resume);
  app.materials = materials;
  app.truthWarnings = reviewMaterials(materials, profile);
  app.markModified("materials");
  if (resumeChanged) {
    app.resumeVersion += 1;
    app.resumeFiles.push(await saveResumeFiles(jobId, app.resumeVersion, profile, materials.resume));
    app.automationLog.push({ at: new Date(), message: `Resume edited — saved as v${app.resumeVersion}.` });
  }
  await app.save();
  return app.toObject();
}
