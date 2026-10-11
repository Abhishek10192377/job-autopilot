// Mode A: opens the official application form in a visible browser and prefills the fields it can verify.
// It never clicks Submit, never touches a CAPTCHA, and never answers a personal declaration.
import path from "node:path";
import type { BrowserContext, Page } from "playwright-core";
import type { AnswerItem, Profile } from "@/shared/types";
import { env } from "../config/env";
import { Application, Job } from "../db/models";
import { answerList } from "../documents/tailor";
import { errorMessage } from "../lib/logger";
import { getProfile } from "../profile/profile";
import { PermanentError } from "../queue/queue";
import { getSettings } from "../settings";
import { TrackingError } from "../tracking/applications";
import { policyFor, SENSITIVE_FIELD } from "./policy";

export interface FormField {
  idx: number;
  label: string;
  kind: "text" | "textarea" | "select" | "choice" | "file";
  required: boolean;
  filled: boolean;
}

export interface FillPlan {
  fill: { idx: number; label: string; value: string }[];
  resumeFieldIdx: number | null;
  /** Fields left for the user, with the reason. */
  needsYou: string[];
}

const FIELD_MAP: [RegExp, string][] = [
  [/^(first|given) name/i, "firstName"],
  [/^(last|family) name|surname/i, "lastName"],
  [/^(full |legal |your )?name\b/i, "fullName"],
  [/e-?mail/i, "email"],
  [/phone|mobile/i, "phone"],
  [/linkedin/i, "linkedin"],
  [/github/i, "github"],
  [/current (company|employer|organi[sz]ation)|^(company|org)\b/i, "currentCompany"],
  [/current (job )?(title|role|position)/i, "currentTitle"],
  [/current (city|location)|^(city|location)\b/i, "currentLocation"],
];

export function fillableAnswers(profile: Profile, now = new Date()): Map<string, AnswerItem> {
  const answers = new Map(answerList(profile, now).map((a) => [a.key, a]));
  const name = answers.get("fullName");
  if (name?.verified) {
    const parts = name.answer.trim().split(/\s+/);
    answers.set("firstName", { ...name, key: "firstName", answer: parts[0] });
    if (parts.length > 1) answers.set("lastName", { ...name, key: "lastName", answer: parts.slice(1).join(" ") });
  }
  return answers;
}

/** Decide what to type where. Pure, so the rules can be tested without a browser. */
export function planFill(fields: FormField[], answers: Map<string, AnswerItem>): FillPlan {
  const plan: FillPlan = { fill: [], resumeFieldIdx: null, needsYou: [] };
  let unnamed = 0;
  for (const f of fields) {
    const label = f.label.replace(/[*✱]/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
    // Helper inputs of custom dropdowns and machine-named fields cannot be described usefully one by one.
    if (f.kind !== "file" && (!label || /^cards\[|^[\w-]{24,}$|^question_\d+/.test(label))) {
      if (f.required && !f.filled) unnamed++;
      continue;
    }
    if (f.kind === "file") {
      if (plan.resumeFieldIdx === null && /resume|\bcv\b/i.test(label)) plan.resumeFieldIdx = f.idx;
      else if (f.required) plan.needsYou.push(`${label || "File upload"} — attach it yourself`);
      continue;
    }
    if (f.filled) continue;
    const profileLink = /linkedin|github/i.test(label);
    if (SENSITIVE_FIELD.test(label) && !profileLink) {
      plan.needsYou.push(`${label} — personal declaration, answer it yourself`);
      continue;
    }
    const key = f.kind === "text" ? FIELD_MAP.find(([re]) => re.test(label))?.[1] : undefined;
    const answer = key ? answers.get(key) : undefined;
    if (answer?.verified && answer.answer && !answer.sensitive) plan.fill.push({ idx: f.idx, label, value: answer.answer });
    else if (f.required) plan.needsYou.push(`${label} — no verified answer in your profile`);
  }
  // A custom dropdown reports its question twice (the label and its helper input); list each question once.
  const seen = new Set<string>();
  plan.needsYou = plan.needsYou.filter((n) => {
    const key = n.slice(0, 40).toLowerCase();
    return seen.has(key) ? false : Boolean(seen.add(key));
  });
  if (unnamed) plan.needsYou.push(`${unnamed} more required question${unnamed === 1 ? "" : "s"} on the form — answer ${unnamed === 1 ? "it" : "them"} yourself`);
  return plan;
}

const g = globalThis as unknown as { __jaBrowser?: BrowserContext };

async function browser(): Promise<BrowserContext> {
  if (g.__jaBrowser) return g.__jaBrowser;
  const { chromium } = await import("playwright-core");
  try {
    const ctx = await chromium.launchPersistentContext(path.join(env.dataDir, "browser-profile"), { channel: env.browserChannel, headless: false, viewport: null });
    ctx.on("close", () => {
      g.__jaBrowser = undefined;
    });
    g.__jaBrowser = ctx;
    return ctx;
  } catch (e) {
    throw new PermanentError(`Could not start ${env.browserChannel} for assisted autofill (${errorMessage(e).split("\n")[0]}). Set BROWSER_CHANNEL to msedge or chrome.`);
  }
}

/** Read the visible form fields on an application page and tag each one so it can be filled. Changes nothing the user can see. */
export async function readForm(page: Page): Promise<{ fields: FormField[]; captcha: boolean }> {
  // Ashby renders its application without a <form> element, so wait for either shape.
  await page.waitForSelector('form input, input[type="email"], input[type="file"]', { timeout: 15_000, state: "attached" }).catch(() => null);
  const result = await page.evaluate(() => {
    const out: { idx: number; label: string; kind: string; required: boolean; filled: boolean }[] = [];
    const seenGroups = new Set<string>();
    let idx = 0;
    const scope = document.querySelector("form input") ? "form " : "";
    for (const el of Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`${scope}input, ${scope}textarea, ${scope}select`))) {
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (["hidden", "submit", "button", "search", "image", "reset", "password"].includes(type)) continue;
      const isFile = type === "file";
      const rect = el.getBoundingClientRect();
      if (!isFile && (rect.width === 0 || rect.height === 0)) continue;
      const isChoice = type === "radio" || type === "checkbox";
      if (isChoice) {
        const group = el.getAttribute("name") || el.id;
        if (seenGroups.has(group)) continue;
        seenGroups.add(group);
      }
      const labelledBy = el.getAttribute("aria-labelledby");
      const text =
        (isChoice ? el.closest("fieldset")?.querySelector("legend")?.textContent : null) ||
        (el as HTMLInputElement).labels?.[0]?.textContent ||
        el.getAttribute("aria-label") ||
        (labelledBy ? document.getElementById(labelledBy.split(" ")[0])?.textContent : null) ||
        el.closest("label")?.textContent ||
        // Custom questions: the question text sits in a label-like element of the enclosing block.
        el.closest("li, fieldset, [class*='question'], [class*='field'], [class*='Field']")?.querySelector("label, legend, [class*='label'], [class*='Label']")?.textContent ||
        el.getAttribute("placeholder") ||
        "";
      const label = isFile ? `${text} ${el.id} ${el.getAttribute("name") ?? ""}` : text || el.getAttribute("name") || el.id;
      el.setAttribute("data-ja-idx", String(idx));
      out.push({
        idx: idx++,
        label: label.trim(),
        kind: isFile ? "file" : isChoice ? "choice" : el.tagName === "TEXTAREA" ? "textarea" : el.tagName === "SELECT" ? "select" : "text",
        required: (el as HTMLInputElement).required || el.getAttribute("aria-required") === "true" || /[*✱]\s*$/.test(text.trim()),
        filled: isChoice ? false : Boolean((el as HTMLInputElement).value),
      });
    }
    const captcha = Boolean(document.querySelector('iframe[src*="captcha"], .g-recaptcha, .h-captcha, [data-sitekey]'));
    return { fields: out, captcha };
  });
  return result as { fields: FormField[]; captcha: boolean };
}

export interface AutofillReport {
  filled: string[];
  resumeAttached: boolean;
  needsYou: string[];
  captcha: boolean;
  message: string;
}

/** Open the job's application form and prefill it. The browser window is left open for the user to review and submit. */
export async function assistedAutofill(jobId: string): Promise<AutofillReport> {
  const job = await Job.findById(jobId).lean();
  if (!job) throw new TrackingError("Job not found.", "not_found");
  const settings = await getSettings();
  const policy = policyFor(job);
  if (settings.automation.paused) throw new PermanentError("Automation is paused.");
  if (!settings.assistedAutofill) throw new PermanentError("Assisted autofill is turned off in Settings.");
  if (!policy.assistedAutofill) throw new PermanentError(`${policy.label}: autofill is not permitted here. ${policy.explanation}`);
  const app = await Application.findOne({ jobId: job._id }).lean();
  const resume = app?.resumeFiles.at(-1);
  if (!app?.materials || !resume) throw new TrackingError("Prepare the application materials first.", "not_prepared");

  const page = await (await browser()).newPage();
  await page.goto(job.applyUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });

  const { fields, captcha } = await readForm(page);

  const plan = planFill(fields, fillableAnswers(await getProfile()));
  const filled: string[] = [];
  const needsYou = [...plan.needsYou];
  for (const f of plan.fill) {
    try {
      await page.locator(`[data-ja-idx="${f.idx}"]`).fill(f.value, { timeout: 5000 });
      filled.push(f.label);
    } catch {
      needsYou.push(`${f.label} — could not be filled automatically`);
    }
  }
  let resumeAttached = false;
  if (plan.resumeFieldIdx !== null) {
    try {
      await page.locator(`[data-ja-idx="${plan.resumeFieldIdx}"]`).setInputFiles(resume.pdf, { timeout: 10_000 });
      resumeAttached = true;
    } catch {
      /* reported below */
    }
  }
  if (!resumeAttached) needsYou.push(`Resume — attach ${path.basename(resume.pdf)} yourself`);
  if (captcha) needsYou.push("CAPTCHA — complete it yourself");
  await page.bringToFront().catch(() => null);

  const message = fields.length
    ? `Prefilled ${filled.length} field${filled.length === 1 ? "" : "s"}${resumeAttached ? " and attached your resume" : ""}. Review everything in the browser window and press Submit yourself.`
    : "The form could not be found on the page, so nothing was filled. Complete it in the browser window.";
  await Application.updateOne({ _id: app._id }, { $push: { automationLog: { at: new Date(), message: `Assisted autofill: ${filled.length} field(s) filled${resumeAttached ? ", resume attached" : ""}; ${needsYou.length} left for you. Not submitted.` } } });
  return { filled, resumeAttached, needsYou, captcha, message };
}
