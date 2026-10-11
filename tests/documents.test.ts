import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Application, Job } from "@/server/db/models";
import { ingest } from "@/server/discovery/discover";
import { enrich } from "@/server/discovery/enrich";
import { prepareApplication, updateMaterials } from "@/server/documents/prepare";
import { renderLetterPdf, renderResumeDocx, renderResumePdf, resolveResume } from "@/server/documents/render";
import { buildMaterials, displayTitle, firstPerson, reviewMaterials, templateMaterials } from "@/server/documents/tailor";
import { checkTruth } from "@/server/documents/truth";
import { extractSkills } from "@/server/matching/lexicon";
import { loadSeedProfile, mentionableSkills } from "@/server/profile/profile";
import { compareResume, parseResumeText } from "@/server/profile/resume";
import { NOW, rawJob, startDb, stopDb } from "./helpers";

const profile = await loadSeedProfile();
const job = enrich(rawJob());
const pythonJob = enrich(rawJob({ title: "Full Stack Developer", descriptionText: "Requirements\n- 2 years with Python, Django and AWS\n- React on the frontend\n- Docker and Kubernetes" }));

const texts = (m: ReturnType<typeof templateMaterials>) => [m.resume.summary, m.coverLetter, m.recruiterMessage, m.linkedinMessage, m.emailSubject, m.emailBody];

describe("truth check", () => {
  it("accepts text that only restates the resume", () => {
    expect(checkTruth("I build Next.js and TypeScript interfaces with Material UI, and worked on a migration from Node.js to .NET.", profile, NOW)).toEqual([]);
    expect(checkTruth("I completed a four-year B.Tech and have 1 year of full-time experience.", profile, NOW)).toEqual([]);
  });

  it("flags skills, experience, figures and credentials the resume does not support", () => {
    const problems = checkTruth("I have 5 years of experience with Python and AWS, improved performance by 40%, led a team, and am an AWS certified developer.", profile, NOW).join(" | ");
    expect(problems).toMatch(/mentions Python/);
    expect(problems).toMatch(/mentions AWS/);
    expect(problems).toMatch(/claims 5 years/);
    expect(problems).toMatch(/"40%"/);
    expect(problems).toMatch(/leading or managing a team/);
    expect(problems).toMatch(/a certification/);
  });
});

describe("tailored materials", () => {
  it("produces every document without inventing anything", () => {
    const m = templateMaterials(job, profile, NOW);
    for (const text of texts(m)) {
      expect(text.length).toBeGreaterThan(10);
      expect(checkTruth(text, profile, NOW)).toEqual([]);
    }
    expect(reviewMaterials(m, profile, NOW)).toEqual([]);
    expect(m.coverLetter).toContain("Acme Labs");
    expect(m.coverLetter).toContain("Lovely Professional University");
    expect(m.linkedinMessage.length).toBeLessThanOrEqual(300);
    expect(m.emailSubject).toBe("Application for Frontend Developer (React / Next.js) – Abhishek Kumar");
  });

  it("never mentions technologies the job wants but the resume lacks", () => {
    const m = templateMaterials(pythonJob, profile, NOW);
    const allowed = mentionableSkills(profile);
    for (const text of texts(m)) for (const skill of extractSkills(text)) expect(allowed.has(skill), `${skill} in: ${text}`).toBe(true);
  });

  it("reorders resume bullets but keeps every one, word for word", () => {
    const m = templateMaterials(job, profile, NOW);
    for (const section of m.resume.experience) {
      const source = profile.experience.find((e) => e.id === section.id)!;
      expect([...section.bulletIds].sort()).toEqual(source.bullets.map((b) => b.id).sort());
    }
    const resolved = resolveResume(profile, m.resume);
    const original = new Set([...profile.experience, ...profile.projects].flatMap((e) => e.bullets.map((b) => b.text)));
    for (const bullet of [...resolved.experience, ...resolved.projects].flatMap((e) => e.bullets)) expect(original.has(bullet)).toBe(true);
    expect(resolved.experience[0].dates).toBe("Jul 2025 – Present");
    expect(resolved.experience[1].dates).toBe("Jan 2025 – Jun 2025");
    // The most relevant bullet for a Next.js role comes first.
    expect(resolved.experience[0].bullets[0]).toMatch(/Next\.js/);
  });

  it("states experience exactly as the dates support", () => {
    const m = templateMaterials(job, profile, NOW);
    expect(m.resume.summary).toMatch(/over 1 year of full-time experience and a 6-month internship/);
    expect(firstPerson("Developing and maintaining modules.")).toBe("have been developing and maintaining modules");
    expect(firstPerson("Built reusable components.")).toBe("built reusable components");
  });

  it("tidies job-board noise out of the title used in letters", () => {
    expect(displayTitle("Web Developer (Fresh graduate welcome, WFH policy, on-job-training)")).toBe("Web Developer");
    expect(displayTitle("Frontend Developer (React / Next.js)")).toBe("Frontend Developer (React / Next.js)");
    expect(displayTitle("Full Stack Engineer - Remote (India)")).toBe("Full Stack Engineer");
    expect(displayTitle("(Remote)")).toBe("(Remote)");
  });

  it("falls back to the template when no AI key is configured", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    const result = await buildMaterials(job, profile, { now: NOW });
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
    expect(result.generatedBy).toBe("template");
    expect(result.warnings).toEqual([]);
  });

  it("renders PDF and DOCX files", async () => {
    const m = templateMaterials(job, profile, NOW);
    const pdf = await renderResumePdf(profile, m.resume);
    const docx = await renderResumeDocx(profile, m.resume);
    const letter = await renderLetterPdf(profile, m.coverLetter);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(letter.subarray(0, 5).toString()).toBe("%PDF-");
    expect(docx.subarray(0, 2).toString()).toBe("PK");
    expect(pdf.length).toBeGreaterThan(3000);
  });
});

describe("resume file check", () => {
  const text = `Abhishek Kumar\n+91 6284572866 | abhisheksahni0077@gmail.com | linkedin.com/in/abhishek-sahni-6a7042308 | github.com/Abhishek10192377\nTECHNICAL SKILLS\n${profile.skills.map((g) => `${g.category}: ${g.items.join(", ")}`).join("\n")}\nEXPERIENCE\nLovely Professional University\nAnsh Infotech\nMERN stack, Stored Procedures, SMTP & IMAP, migration to .NET\nEDUCATION`;

  it("parses contact details, skills and sections", () => {
    const parsed = parseResumeText(text);
    expect(parsed.email).toBe("abhisheksahni0077@gmail.com");
    expect(parsed.linkedin).toBe("linkedin.com/in/abhishek-sahni-6a7042308");
    expect(parsed.skills).toEqual(expect.arrayContaining(["TypeScript", "Next.js", "SQL Server"]));
    expect(parsed.sections).toEqual(["TECHNICAL SKILLS", "EXPERIENCE", "EDUCATION"]);
  });

  it("reports nothing when profile and resume agree, and flags unsupported profile skills", () => {
    expect(compareResume(parseResumeText(text), profile)).toEqual([]);
    const padded = { ...profile, skills: [...profile.skills, { category: "Cloud", items: ["AWS"] }] };
    expect(compareResume(parseResumeText(text), padded).join(" ")).toMatch(/profile lists AWS/);
    expect(compareResume(parseResumeText(`${text}\nKubernetes`), profile).join(" ")).toMatch(/resume mentions Kubernetes/);
  });
});

describe("saved application versions", () => {
  beforeAll(async () => {
    await startDb();
    await ingest([rawJob()]);
  });
  afterAll(stopDb);

  it("saves each tailored resume as its own file and never overwrites an earlier one", async () => {
    const stored = (await Job.findOne().lean())!;
    const first = await prepareApplication(stored._id, { useAi: false });
    expect(first.resumeVersion).toBe(1);
    expect((await Job.findById(stored._id).lean())!.status).toBe("prepared");
    const v1 = first.resumeFiles[0];
    expect(existsSync(v1.pdf) && existsSync(v1.docx)).toBe(true);

    const edited = await updateMaterials(stored._id, { ...first.materials, coverLetter: `${first.materials.coverLetter}\n\nP.S. I can start after my notice period.` });
    expect(edited.resumeVersion).toBe(1); // the resume itself did not change

    const changed = await updateMaterials(stored._id, { ...edited.materials, resume: { ...edited.materials.resume, summary: "Frontend developer working with Next.js, React and TypeScript." } });
    expect(changed.resumeVersion).toBe(2);
    expect(changed.resumeFiles.map((f) => f.version)).toEqual([1, 2]);
    expect(existsSync(v1.pdf)).toBe(true);
    expect(existsSync(changed.resumeFiles[1].pdf)).toBe(true);
    expect(changed.resumeFiles[1].pdf).not.toBe(v1.pdf);
  });

  it("warns when a hand edit adds a claim the resume does not support", async () => {
    const stored = (await Job.findOne().lean())!;
    const app = (await Application.findOne({ jobId: stored._id }).lean())!;
    const edited = await updateMaterials(stored._id, { ...app.materials, coverLetter: "I have 6 years of experience with Python." });
    expect(edited.truthWarnings.join(" ")).toMatch(/cover letter.*Python/);
  });
});
