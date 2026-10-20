import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAutoApply } from "@/services/apply/apply";
import { fillableAnswers, planFill, type FormField } from "@/services/apply/autofill";
import { evaluateAutoApply, policyFor, type AutoApplyContext } from "@/services/apply/policy";
import { hashPassword, verifyPassword } from "@/services/auth/password";
import { createSessionToken, verifySessionToken } from "@/services/auth/session";
import { Activity, Application, Job, Task } from "@/models";
import { ingest } from "@/services/discovery/discover";
import { prepareApplication } from "@/services/documents/prepare";
import { isAllowedByRules, parseRobots } from "@/utils/robots";
import { runFollowUps } from "@/services/notifications/notify";
import { loadSeedProfile } from "@/services/profile/profile";
import { schedulerTick, workOnce } from "@/worker/handlers";
import { claimNext, enqueue, fail } from "@/worker/queue";
import { DEFAULT_SETTINGS, saveSettings, setPaused } from "@/services/settingsService";
import { markApplied, transition } from "@/services/tracking/applications";
import { getStats } from "@/services/tracking/stats";
import { canTransition } from "@/utils/status";
import { rawJob, startDb, stopDb } from "./helpers";

const profile = await loadSeedProfile();

beforeAll(async () => {
  await startDb();
  await ingest([
    rawJob(),
    rawJob({ sourceId: "2", company: "Globex", url: "https://jobs.example.com/globex/react", descriptionText: `${rawJob().descriptionText}\n\nTo apply, send your resume to careers@globex.example.` }),
  ]);
});
afterAll(stopDb);

const acme = async () => (await Job.findOne({ company: "Acme Labs" }).lean())!;
const globex = async () => (await Job.findOne({ company: "Globex" }).lean())!;

describe("status pipeline", () => {
  it("follows Discovered → Matched → Saved → Prepared → Awaiting approval → Applied → Interview → Offer / Rejected", () => {
    const path = ["discovered", "matched", "saved", "prepared", "awaiting_approval", "applied", "interview", "offer"] as const;
    for (let i = 1; i < path.length; i++) expect(canTransition(path[i - 1], path[i]), `${path[i - 1]} → ${path[i]}`).toBe(true);
    expect(canTransition("applied", "rejected")).toBe(true);
    expect(canTransition("applied", "discovered")).toBe(false);
    expect(canTransition("rejected", "applied")).toBe(false);
  });

  it("requires prepared materials before Prepared or Awaiting approval", async () => {
    await expect(transition((await acme())._id, "prepared")).rejects.toMatchObject({ code: "not_prepared" });
  });

  it("tracks an application from prepared to interview", async () => {
    const job = await acme();
    await prepareApplication(job._id, { useAi: false });
    await markApplied(job._id, "greenhouse form");
    const app = (await Application.findOne({ jobId: job._id }).lean())!;
    expect(app.appliedVia).toBe("greenhouse form");
    expect(app.resumeVersion).toBe(1);
    const days = (app.followUpDate!.getTime() - app.appliedAt!.getTime()) / 86_400_000;
    expect(days).toBe(DEFAULT_SETTINGS.followUpDays);
    expect(await getStats()).toMatchObject({ discovered: 2, prepared: 1, submitted: 1, interviews: 0, successRate: 0 });

    await transition(job._id, "interview");
    expect(await getStats()).toMatchObject({ interviews: 1, successRate: 100 });
    expect((await acme()).statusHistory.map((h) => h.status)).toEqual(["matched", "prepared", "applied", "interview"]);
  });

  it("raises each follow-up reminder once, only while still waiting for a reply", async () => {
    const job = await globex();
    await markApplied(job._id, "manual");
    await Application.updateMany({}, { $set: { followUpDate: new Date(Date.now() - 1000) } });
    expect(await runFollowUps()).toBe("1 follow-up reminder raised."); // Acme is already at interview
    expect(await Activity.countDocuments({ type: "follow-up" })).toBe(1);
    expect(await runFollowUps()).toBe("0 follow-up reminders raised.");
    await Job.updateOne({ _id: job._id }, { $set: { status: "matched" } });
    await Application.deleteOne({ jobId: job._id });
  });
});

describe("automation policy", () => {
  it("never automates job portals and only prefills public ATS forms", () => {
    const p = (applyUrl: string, applyEmail: string | null = null) => policyFor({ applyUrl, applyEmail });
    expect(p("https://job-boards.greenhouse.io/acme/jobs/1")).toMatchObject({ channel: "greenhouse", assistedAutofill: true, autoSubmit: false });
    expect(p("https://jobs.lever.co/acme/1/apply")).toMatchObject({ channel: "lever", assistedAutofill: true, autoSubmit: false });
    expect(p("https://jobs.ashbyhq.com/acme/1/application")).toMatchObject({ channel: "ashby", assistedAutofill: true, autoSubmit: false });
    for (const url of ["https://www.linkedin.com/jobs/view/1", "https://in.indeed.com/viewjob?jk=1", "https://www.naukri.com/job-listings-1", "https://wellfound.com/jobs/1", "https://cutshort.io/job/1", "https://www.instahyre.com/job-1"]) {
      expect(p(url, "hr@example.com"), url).toMatchObject({ channel: "restricted", assistedAutofill: false, autoSubmit: false });
    }
    expect(p("https://acme.example/careers/1", "jobs@acme.example")).toMatchObject({ channel: "email", autoSubmit: true });
    expect(p("https://acme.example/careers/1")).toMatchObject({ channel: "other", assistedAutofill: false, autoSubmit: false });
  });

  it("sends automatically only when every check passes", async () => {
    const job = await globex();
    expect(job.applyEmail).toBe("careers@globex.example");
    const app = await prepareApplication(job._id, { useAi: false });
    const fresh = await globex();
    const ctx: AutoApplyContext = { settings: { ...DEFAULT_SETTINGS, reviewMode: "auto" }, smtpConfigured: true, autoAppliedToday: 0, duplicateOf: null };
    expect(evaluateAutoApply(fresh, app, ctx)).toEqual({ eligible: true, reasons: [] });

    const reasons = (over: Partial<AutoApplyContext>, j = fresh, a: typeof app | null = app) => evaluateAutoApply(j, a, { ...ctx, ...over }).reasons.join(" ");
    expect(reasons({ settings: DEFAULT_SETTINGS })).toMatch(/assisted/);
    expect(reasons({ settings: { ...ctx.settings, automation: { paused: true } } })).toMatch(/paused/);
    expect(reasons({ smtpConfigured: false })).toMatch(/SMTP/);
    expect(reasons({ autoAppliedToday: 5 })).toMatch(/Daily automatic-application limit/);
    expect(reasons({ duplicateOf: { title: "X", company: "Y" } })).toMatch(/Duplicate/);
    expect(reasons({ settings: { ...ctx.settings, minScore: 99 } })).toMatch(/below your minimum/);
    expect(reasons({}, fresh, null)).toMatch(/not been prepared/);
    expect(reasons({}, fresh, { ...app, truthWarnings: ["check this"] })).toMatch(/unresolved review notes/);
    expect(reasons({}, { ...fresh, applyUrl: "https://www.linkedin.com/jobs/view/1" })).toMatch(/not permitted on this channel/);
  });

  it("holds an email application for approval when it cannot be sent, and does nothing in assisted mode or while paused", async () => {
    expect(await runAutoApply()).toMatch(/assisted/);
    await saveSettings({ reviewMode: "auto" });
    await setPaused(true);
    expect(await runAutoApply()).toBe("Automation is paused.");
    await setPaused(false);
    // No SMTP is configured in tests, so nothing can be sent: the job must wait for approval instead.
    expect(await runAutoApply()).toBe("0 sent, 1 waiting for approval.");
    const job = await globex();
    expect(job.status).toBe("awaiting_approval");
    expect(job.statusHistory.at(-1)!.note).toMatch(/SMTP is not configured/);
    expect((await Application.findOne({ jobId: job._id }).lean())!.appliedAt).toBeUndefined();
    await saveSettings({ reviewMode: "assisted" });
  });
});

describe("assisted autofill plan", () => {
  const field = (idx: number, label: string, over: Partial<FormField> = {}): FormField => ({ idx, label, kind: "text", required: true, filled: false, ...over });

  it("fills verified contact fields, attaches the resume and leaves declarations to the user", () => {
    const plan = planFill(
      [
        field(0, "First Name *"),
        field(1, "Last Name *"),
        field(2, "Email *"),
        field(3, "Phone"),
        field(4, "LinkedIn Profile"),
        field(5, "Resume/CV resume", { kind: "file" }),
        field(6, "Are you legally authorized to work in the country?", { kind: "select" }),
        field(7, "Expected salary"),
        field(8, "Gender", { kind: "choice", required: false }),
        field(9, "Current location *"),
        field(10, "Why do you want to work here? *", { kind: "textarea" }),
        field(11, "Website", { required: false }),
        field(12, "Email", { filled: true }),
      ],
      fillableAnswers(profile),
    );
    expect(Object.fromEntries(plan.fill.map((f) => [f.label, f.value]))).toEqual({
      "First Name": "Abhishek",
      "Last Name": "Kumar",
      Email: "abhisheksahni0077@gmail.com",
      Phone: "+91 6284572866",
      "LinkedIn Profile": "https://www.linkedin.com/in/abhishek-sahni-6a7042308",
    });
    expect(plan.resumeFieldIdx).toBe(5);
    const left = plan.needsYou.join(" | ");
    expect(left).toMatch(/authorized to work.*personal declaration/);
    expect(left).toMatch(/Expected salary.*personal declaration/);
    expect(left).toMatch(/Gender.*personal declaration/);
    expect(left).toMatch(/Current location.*no verified answer/); // not verified in the profile, so never guessed
    expect(left).toMatch(/Why do you want to work here.*no verified answer/);
    expect(left).not.toMatch(/Website/);
  });
});

describe("task queue", () => {
  it("does not queue the same work twice and hands each task to one worker", async () => {
    await Task.deleteMany({});
    expect(await enqueue("discover", {}, { uniqueKey: "discover" })).not.toBeNull();
    expect(await enqueue("discover", {}, { uniqueKey: "discover" })).toBeNull();
    const [a, b] = await Promise.all([claimNext(), claimNext()]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("retries with a delay and gives up at the retry limit", async () => {
    await Task.deleteMany({});
    await enqueue("x", {}, { maxAttempts: 2 });
    const first = (await claimNext())!;
    expect(await fail(first, new Error("boom"))).toBe(false);
    const waiting = (await Task.findById(first._id).lean())!;
    expect(waiting.status).toBe("queued");
    expect(waiting.runAt.getTime()).toBeGreaterThan(Date.now() + 60_000);
    expect(await claimNext()).toBeNull(); // not due yet
    await Task.updateOne({ _id: first._id }, { $set: { runAt: new Date() } });
    expect(await fail((await claimNext())!, new Error("boom"))).toBe(true);
    expect((await Task.findById(first._id).lean())!.status).toBe("failed");
  });

  it("schedules and runs nothing while automation is paused", async () => {
    await Task.deleteMany({});
    await setPaused(true);
    await schedulerTick();
    expect(await Task.countDocuments()).toBe(0);
    await enqueue("follow-ups");
    expect(await workOnce()).toBe(false);
    await setPaused(false);
    expect(await workOnce()).toBe(true);
    expect((await Task.findOne().lean())!.status).toBe("done");
  });
});

describe("dashboard security helpers", () => {
  it("hashes and verifies the password", () => {
    const hash = hashPassword("correct horse battery");
    expect(hash).not.toContain("correct horse");
    expect(hash).not.toContain("$");
    expect(verifyPassword("correct horse battery", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
    expect(verifyPassword("anything", "")).toBe(false);
  });

  it("rejects missing, forged and unsigned session tokens", async () => {
    process.env.AUTH_SECRET = "a".repeat(48);
    const token = await createSessionToken();
    expect(await verifySessionToken(token)).toBe(true);
    expect(await verifySessionToken(undefined)).toBe(false);
    expect(await verifySessionToken(`${token.slice(0, -4)}AAAA`)).toBe(false);
    process.env.AUTH_SECRET = "b".repeat(48);
    expect(await verifySessionToken(token)).toBe(false);
    process.env.AUTH_SECRET = "";
    expect(await verifySessionToken(token)).toBe(false);
  });

  it("honours robots.txt rules", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /private/\nAllow: /private/feed.rss\n\nUser-agent: badbot\nDisallow: /");
    expect(isAllowedByRules(rules, "/categories/jobs.rss")).toBe(true);
    expect(isAllowedByRules(rules, "/private/data")).toBe(false);
    expect(isAllowedByRules(rules, "/private/feed.rss")).toBe(true);
  });
});
