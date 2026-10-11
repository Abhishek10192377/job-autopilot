// Sending applications. Every path goes through policyFor / evaluateAutoApply and the duplicate check first.
import path from "node:path";
import type { Types } from "mongoose";
import { canTransition, isSubmitted } from "@/shared/status";
import { env } from "../config/env";
import { Application, Job, type IApplication, type IJob } from "../db/models";
import { prepareApplication } from "../documents/prepare";
import { errorMessage, logger } from "../lib/logger";
import { sendMail } from "../notifications/mail";
import { PermanentError } from "../queue/queue";
import { getSettings } from "../settings";
import { logActivity } from "../tracking/activity";
import { findDuplicateApplication, markApplied, TrackingError, transition } from "../tracking/applications";
import { evaluateAutoApply, policyFor, type AutoApplyContext } from "./policy";

const log = logger("apply");
type Id = Types.ObjectId | string;

export const AUTO_VIA = "email (automatic)";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function autoContext(job: IJob): Promise<AutoApplyContext> {
  return {
    settings: await getSettings(),
    smtpConfigured: env.smtp !== null,
    autoAppliedToday: await Application.countDocuments({ appliedVia: AUTO_VIA, appliedAt: { $gte: startOfToday() } }),
    duplicateOf: await findDuplicateApplication(job),
  };
}

/** Everything the "Apply" panel needs to explain what is and is not permitted for this job. */
export async function applyOverview(job: IJob, app: IApplication | null) {
  const ctx = await autoContext(job);
  const dup = ctx.duplicateOf as IJob | null;
  return {
    policy: policyFor(job),
    duplicateOf: dup ? { _id: String(dup._id), title: dup.title, company: dup.company, source: dup.source } : null,
    auto: evaluateAutoApply(job, app, ctx),
    smtpConfigured: ctx.smtpConfigured,
    aiConfigured: env.aiConfigured,
    assistedAutofill: ctx.settings.assistedAutofill,
    paused: ctx.settings.automation.paused,
  };
}

/**
 * Email the prepared application to the address the posting asks applicants to use.
 * "approved" = the user clicked Send; "automatic" = Mode B, after evaluateAutoApply passed.
 */
export async function sendEmailApplication(jobId: Id, mode: "approved" | "automatic"): Promise<IJob> {
  const job = await Job.findById(jobId).lean();
  if (!job) throw new TrackingError("Job not found.", "not_found");
  if (policyFor(job).channel !== "email" || !job.applyEmail) throw new PermanentError("This posting does not invite applications by email.");
  if (isSubmitted(job.status)) throw new TrackingError("This job is already marked as applied.", "duplicate");
  const dup = await findDuplicateApplication(job);
  if (dup) throw new TrackingError(`You already applied to "${dup.title}" at ${dup.company}. Duplicate application blocked.`, "duplicate");
  const app = await Application.findOne({ jobId: job._id }).lean();
  const resume = app?.resumeFiles.at(-1);
  if (!app?.materials || !resume) throw new TrackingError("Prepare the application materials first.", "not_prepared");

  // Claim the send atomically so a double click or a second worker can never email the same employer twice.
  const claimed = await Application.findOneAndUpdate({ _id: app._id, emailSentAt: null }, { $set: { emailSentAt: new Date() } });
  if (!claimed) throw new TrackingError("An email for this application has already been sent.", "duplicate");
  try {
    const messageId = await sendMail({
      to: job.applyEmail,
      subject: app.materials.emailSubject,
      text: app.materials.emailBody,
      attachments: [{ filename: path.basename(resume.pdf), path: resume.pdf }],
    });
    await Application.updateOne({ _id: app._id }, { $push: { automationLog: { at: new Date(), message: `Email sent to ${job.applyEmail} (${mode}); message id ${messageId}.` } } });
  } catch (e) {
    await Application.updateOne({ _id: app._id }, { $set: { emailSentAt: null }, $push: { automationLog: { at: new Date(), message: `Email to ${job.applyEmail} failed: ${errorMessage(e)}` } } });
    throw e;
  }
  return markApplied(job._id, mode === "automatic" ? AUTO_VIA : "email");
}

/** Park a prepared application until the user approves it. */
export async function requestApproval(jobId: Id, reasons: string[] = []): Promise<IJob> {
  const job = await transition(jobId, "awaiting_approval", reasons.length ? reasons.join(" ") : "Waiting for your approval");
  await Application.updateOne({ jobId: job._id }, { $push: { automationLog: { at: new Date(), message: `Waiting for your approval.${reasons.length ? ` ${reasons.join(" ")}` : ""}` } } });
  return job;
}

/**
 * Mode B. Only email applications can be sent without a click, and only when every eligibility check passes;
 * anything else is prepared and left in "Awaiting approval" with the reasons recorded.
 */
export async function runAutoApply(): Promise<string> {
  const settings = await getSettings();
  if (settings.automation.paused) return "Automation is paused.";
  if (settings.reviewMode !== "auto") return "Review mode is assisted; nothing is sent automatically.";
  const candidates = await Job.find({ status: { $in: ["matched", "prepared"] }, applyEmail: { $nin: [null, ""] } })
    .sort({ "match.total": -1 })
    .limit(settings.autoApplyDailyLimit)
    .lean();
  let sent = 0;
  let parked = 0;
  for (const candidate of candidates) {
    if (!policyFor(candidate).autoSubmit) continue;
    // The kill switch is honoured between every application.
    if ((await getSettings()).automation.paused) break;
    try {
      let app: IApplication | null = await Application.findOne({ jobId: candidate._id }).lean();
      if (!app?.materials) app = await prepareApplication(candidate._id);
      const job = (await Job.findById(candidate._id).lean())!;
      const ctx = await autoContext(job);
      if (ctx.autoAppliedToday >= ctx.settings.autoApplyDailyLimit) break;
      const decision = evaluateAutoApply(job, app, ctx);
      if (decision.eligible) {
        await sendEmailApplication(job._id, "automatic");
        sent++;
      } else if (canTransition(job.status, "awaiting_approval")) {
        await requestApproval(job._id, decision.reasons);
        await logActivity("approval", `${job.title} at ${job.company} needs your approval: ${decision.reasons.join(" ")}`, { level: "warning", jobId: job._id });
        parked++;
      }
    } catch (e) {
      log.error(`auto-apply failed for ${candidate.title} at ${candidate.company}`, { error: errorMessage(e) });
      await logActivity("apply-error", `Automatic application to ${candidate.title} at ${candidate.company} failed: ${errorMessage(e)}`, { level: "error", jobId: candidate._id });
    }
  }
  return `${sent} sent, ${parked} waiting for approval.`;
}
