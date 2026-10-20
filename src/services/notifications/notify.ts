import { env } from "../../config/env";
import { Application, Job } from "../../models";
import { errorMessage, logger } from "../../utils/logger";
import { getProfile } from "../profile/profile";
import { getSettings } from "../settingsService";
import { logActivity } from "../tracking/activity";
import { sendMail } from "./mail";

const log = logger("notify");

/** Raise a reminder for every application whose follow-up date has arrived. Each one is raised once. */
export async function runFollowUps(now = new Date()): Promise<string> {
  const settings = await getSettings();
  if (!settings.followUpReminders) return "Follow-up reminders are turned off.";
  const due = await Application.find({ appliedAt: { $ne: null }, followUpDate: { $lte: now }, followUpNotifiedAt: null }).lean();
  const lines: string[] = [];
  for (const app of due) {
    const job = await Job.findById(app.jobId).lean();
    // Only applications still waiting for a reply need a nudge.
    if (job?.status === "applied") {
      const days = Math.round((now.getTime() - new Date(app.appliedAt!).getTime()) / 86_400_000);
      await logActivity("follow-up", `Follow up on ${job.title} at ${job.company} — applied ${days} day${days === 1 ? "" : "s"} ago with no reply recorded.`, { level: "warning", jobId: job._id });
      lines.push(`- ${job.title} at ${job.company} (applied ${days} days ago): ${job.url}`);
    }
    await Application.updateOne({ _id: app._id }, { $set: { followUpNotifiedAt: now } });
  }
  if (lines.length && env.smtp) {
    try {
      const profile = await getProfile();
      await sendMail({ to: profile.contact.email, subject: `Job Autopilot: ${lines.length} application${lines.length === 1 ? "" : "s"} to follow up`, text: `These applications have reached their follow-up date:\n\n${lines.join("\n")}\n` });
    } catch (e) {
      log.warn("could not email the follow-up reminder", { error: errorMessage(e) });
    }
  }
  return `${lines.length} follow-up reminder${lines.length === 1 ? "" : "s"} raised.`;
}
