// What kind of automation each application channel permits. This is the single place that decides
// whether the system may open, autofill, or submit — everything else asks here first.
import type { AnswerItem, Settings } from "@/shared/types";
import { isSubmitted } from "@/shared/status";
import type { IApplication, IJob } from "../db/models";

export type Channel = "greenhouse" | "lever" | "ashby" | "email" | "restricted" | "other";

export interface ChannelPolicy {
  channel: Channel;
  label: string;
  /** May a user-supervised browser prefill the form (never submit)? */
  assistedAutofill: boolean;
  /** May the system submit without a click? Only true for email, where the posting itself invites emailed applications. */
  autoSubmit: boolean;
  explanation: string;
}

const RESTRICTED_HOSTS = /(^|\.)(linkedin\.com|indeed\.com|naukri\.com|instahyre\.com|wellfound\.com|angel\.co|cutshort\.io|glassdoor\.[a-z.]+|foundit\.in|monster\.com|shine\.com|internshala\.com|hirist\.tech|ziprecruiter\.com)$/i;

export function policyFor(job: Pick<IJob, "applyUrl" | "applyEmail">): ChannelPolicy {
  let host = "";
  try {
    host = new URL(job.applyUrl).hostname.toLowerCase();
  } catch {
    /* fall through to "other" */
  }
  if (/(^|\.)greenhouse\.io$/.test(host)) {
    return { channel: "greenhouse", label: "Greenhouse form", assistedAutofill: true, autoSubmit: false, explanation: "Public application form with no account. The assistant can prefill it in a browser you watch; you review and press Submit yourself. Automatic submission is not available because Greenhouse's submission API needs a key only the employer holds." };
  }
  if (/(^|\.)lever\.co$/.test(host)) {
    return { channel: "lever", label: "Lever form", assistedAutofill: true, autoSubmit: false, explanation: "Public application form with no account. The assistant can prefill it in a browser you watch; you review and press Submit yourself. Lever's submission API is employer-only." };
  }
  if (/(^|\.)ashbyhq\.com$/.test(host)) {
    return { channel: "ashby", label: "Ashby form", assistedAutofill: true, autoSubmit: false, explanation: "Public application form with no account. The assistant can prefill it in a browser you watch; you review and press Submit yourself. Ashby's submission API is employer-only." };
  }
  if (RESTRICTED_HOSTS.test(host)) {
    return { channel: "restricted", label: "Job portal (manual)", assistedAutofill: false, autoSubmit: false, explanation: "This portal's terms prohibit automated activity, and automating it could get your account restricted. The assistant opens the page and gives you the prepared materials to paste; you apply by hand." };
  }
  if (job.applyEmail) {
    return { channel: "email", label: "Apply by email", assistedAutofill: false, autoSubmit: true, explanation: `The posting asks applicants to email ${job.applyEmail}. Emails are sent from your own mailbox over SMTP — either after your approval or, in automatic mode, when every eligibility check passes.` };
  }
  return { channel: "other", label: "Company site (manual)", assistedAutofill: false, autoSubmit: false, explanation: "Unrecognised application site, so nothing is automated. The assistant opens the page and gives you the prepared materials." };
}

/** Questions that are personal declarations. They are never filled in or answered automatically. */
export const SENSITIVE_FIELD = /gender|sex\b|sexual|orientation|pronoun|race|ethnic|veteran|disab|religio|caste|marital|acknowledg|i confirm|i agree|consent|date of birth|\bdob\b|age\b|nationality|citizen|sponsor|visa|authoriz|authoris|criminal|convict|salary|compensation|ctc|notice period|relocat/i;

export interface AutoApplyDecision {
  eligible: boolean;
  reasons: string[];
}

export interface AutoApplyContext {
  settings: Settings;
  smtpConfigured: boolean;
  autoAppliedToday: number;
  duplicateOf: Pick<IJob, "title" | "company"> | null;
}

/**
 * Mode B gate. An application is sent without a click only when every check below passes;
 * otherwise it waits in "Awaiting approval" with the reasons shown.
 */
export function evaluateAutoApply(job: IJob, app: Pick<IApplication, "materials" | "truthWarnings"> | null, ctx: AutoApplyContext): AutoApplyDecision {
  const reasons: string[] = [];
  const policy = policyFor(job);
  const { settings } = ctx;
  if (settings.automation.paused) reasons.push("Automation is paused.");
  if (settings.reviewMode !== "auto") reasons.push("Review mode is set to assisted, so every application waits for your approval.");
  if (!policy.autoSubmit) reasons.push(`${policy.label}: automatic submission is not permitted on this channel.`);
  if (policy.autoSubmit && !ctx.smtpConfigured) reasons.push("SMTP is not configured, so email cannot be sent.");
  if (isSubmitted(job.status)) reasons.push("Already applied.");
  if (ctx.duplicateOf) reasons.push(`Duplicate of an application already sent to ${ctx.duplicateOf.company} for "${ctx.duplicateOf.title}".`);
  if (!job.match || job.match.total < settings.minScore) reasons.push(`Compatibility score ${job.match?.total ?? "unknown"} is below your minimum of ${settings.minScore}.`);
  if (settings.remoteOnly && job.workMode !== "remote") reasons.push("Remote-only mode is on and this role is not remote.");
  if (job.experienceMin != null && job.experienceMin > settings.maxExperience) reasons.push(`Asks for ${job.experienceMin}+ years, above your maximum of ${settings.maxExperience}.`);
  if (job.employmentType !== "unknown" && !settings.employmentTypes.includes(job.employmentType)) reasons.push(`Employment type is ${job.employmentType}.`);
  if (!app?.materials) reasons.push("Application materials have not been prepared.");
  if (app?.truthWarnings.length) reasons.push("The prepared materials have unresolved review notes.");
  const required: AnswerItem[] = (app?.materials?.answers ?? []).filter((a) => ["fullName", "email", "phone"].includes(a.key));
  if (app?.materials && (required.length < 3 || required.some((a) => !a.verified))) reasons.push("Name, email or phone is not verified in your profile.");
  if (ctx.autoAppliedToday >= settings.autoApplyDailyLimit) reasons.push(`Daily automatic-application limit of ${settings.autoApplyDailyLimit} reached.`);
  return { eligible: reasons.length === 0, reasons };
}
