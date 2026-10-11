import { ApiError, readJson, route } from "@/server/api";
import { Application, Job } from "@/server/db/models";
import { TrackingPatch } from "@/server/validation";

export const PATCH = route<{ id: string }>(async (req, { id }) => {
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
});
