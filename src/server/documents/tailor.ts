// Builds the application pack for one job: tailored resume, summary, cover letter, answers and outreach drafts.
// Resume bullets are always taken verbatim from the master profile — tailoring selects and orders, it never rewrites facts.
import { z } from "zod";
import type { AnswerItem, Materials, Profile, ProfileBullet, ResumeSection, TailoredResume } from "@/shared/types";
import { AiError, structured } from "../ai/client";
import { env } from "../config/env";
import { errorMessage, logger } from "../lib/logger";
import { truncate } from "../lib/text";
import type { JobFacts } from "../matching/heuristic";
import { extractSkills } from "../matching/lexicon";
import { experienceSummary, profileSkillSet, resolvedAnswers } from "../profile/profile";
import { checkTruth } from "./truth";

const log = logger("tailor");

export interface PrepareResult {
  materials: Materials;
  warnings: string[];
  generatedBy: "template" | "ai";
}

const joinList = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Turn a resume bullet ("Built X…", "Developing Y…") into the tail of a first-person sentence. */
export function firstPerson(bullet: string): string {
  const text = lowerFirst(bullet.trim().replace(/\.$/, ""));
  return /^\w+ing\b/.test(text) ? `have been ${text}` : text;
}

/** The job title as it should read in a sentence: without board noise such as "(Fresh graduates welcome, WFH)" or " - Remote". */
export function displayTitle(title: string): string {
  const cleaned = title
    .replace(/\s*[([]([^)\]]*)[)\]]/g, (whole, inner: string) => (inner.length <= 30 && extractSkills(inner).length ? whole : ""))
    .replace(/\s+[-–|]\s+(remote|hybrid|on-?site|wfh|work from home|india)\b.*$/i, "")
    .trim();
  return cleaned || title.trim();
}

function jobSkills(job: JobFacts): string[] {
  return [...new Set([...extractSkills(job.title), ...job.skillsRequired, ...job.skillsPreferred])];
}

function relevance(text: string, wanted: Set<string>): number {
  return extractSkills(text).filter((s) => wanted.has(s)).length;
}

function orderBullets(bullets: ProfileBullet[], wanted: Set<string>): string[] {
  return bullets
    .map((b, i) => ({ id: b.id, i, score: relevance(b.text, wanted) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((b) => b.id);
}

function experiencePhrase(profile: Profile, now: Date): string {
  const exp = experienceSummary(profile, now);
  const years = Math.floor(exp.fullTimeMonths / 12);
  const full = years >= 1 ? `over ${years} year${years > 1 ? "s" : ""}` : `${exp.fullTimeMonths} months`;
  return `${full} of full-time experience${exp.internshipMonths ? ` and a ${exp.internshipMonths}-month internship` : ""}`;
}

function headlineFor(job: JobFacts, profile: Profile, have: Set<string>): string {
  if (/front[- ]?end|react|next\.?js|ui (?:developer|engineer)/i.test(job.title) && have.has("React")) {
    return `Frontend Developer (${["React", "Next.js", "TypeScript"].filter((s) => have.has(s)).join(" / ")})`;
  }
  return profile.headline;
}

/** Deterministic, always-available tailoring built only from resume facts. */
export function templateMaterials(job: JobFacts, profile: Profile, now = new Date()): Materials {
  const have = profileSkillSet(profile);
  const wanted = new Set(jobSkills(job));
  const matched = jobSkills(job).filter((s) => have.has(s) && !["Git", "GitHub", "HTML", "CSS", "Agile"].includes(s));
  const core = matched.length >= 2 ? matched.slice(0, 5) : ["Next.js", "React", "TypeScript", "Node.js"].filter((s) => have.has(s));
  const current = profile.experience.find((e) => e.end === null) ?? profile.experience[0];
  const headline = headlineFor(job, profile, have);
  const rest = profile.summary.split(/(?<=\.)\s+/).slice(1, 3).join(" ");
  const summary = `${headline.replace(/ \(.*\)$/, "")} with ${experiencePhrase(profile, now)}, working with ${joinList(core)}. Currently ${current.title} at ${current.company}. ${rest}`.trim();

  const skills = profile.skills.map((g) => ({
    category: g.category,
    items: [...g.items].sort((a, b) => Number(relevance(b, wanted) > 0) - Number(relevance(a, wanted) > 0)),
  }));
  const experience: ResumeSection[] = profile.experience.map((e) => ({ id: e.id, bulletIds: orderBullets(e.bullets, wanted) }));
  const projects: ResumeSection[] = profile.projects
    .map((p, i) => ({ p, i, score: relevance(`${p.stack.join(", ")} ${p.bullets.map((b) => b.text).join(" ")}`, wanted) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ p }) => ({ id: p.id, bulletIds: orderBullets(p.bullets, wanted) }));
  const resume: TailoredResume = { headline, summary, skills, experience, projects };

  const bulletText = (sectionId: string, pos: number) => {
    const entry = profile.experience.find((e) => e.id === sectionId);
    const order = experience.find((e) => e.id === sectionId)?.bulletIds ?? [];
    return entry?.bullets.find((b) => b.id === order[pos])?.text;
  };
  const intern = profile.experience.find((e) => e.type === "internship");
  const topProject = profile.projects.find((p) => p.id === projects[0]?.id);
  const company = job.company || "your company";
  const title = displayTitle(job.title);
  const paragraphs = [
    `Dear Hiring Team at ${company},`,
    `I am applying for the ${title} position. I am a ${profile.headline} with ${experiencePhrase(profile, now)}, currently working as ${current.title} at ${current.company}.`,
    [
      bulletText(current.id, 0) ? `In my current role I ${firstPerson(bulletText(current.id, 0)!)}.` : "",
      bulletText(current.id, 1) ? `I also ${firstPerson(bulletText(current.id, 1)!)}.` : "",
      intern && bulletText(intern.id, 0) ? `Before that, as an intern at ${intern.company}, I ${firstPerson(bulletText(intern.id, 0)!)}.` : "",
    ].filter(Boolean).join(" "),
    [
      matched.length ? `The role's use of ${joinList(matched.slice(0, 4))} matches the stack I work with day to day.` : "",
      topProject ? `A relevant project is ${topProject.name} (${topProject.stack.slice(0, 4).join(", ")}), where I ${firstPerson(topProject.bullets.find((b) => b.id === projects[0].bulletIds[0])?.text ?? topProject.bullets[0].text)}.` : "",
    ].filter(Boolean).join(" "),
    `I would welcome the chance to discuss how I can contribute to ${company}. My resume is attached, and you can reach me at ${profile.contact.email} or ${profile.contact.phone}.`,
    `Sincerely,\n${profile.name}`,
  ].filter(Boolean);

  const stackLine = joinList(core.slice(0, 4));
  const firstName = profile.name.split(" ")[0];
  const linkedin = (role: string) => `Hi, I'm ${firstName}, a ${profile.headline} working with ${stackLine}. I'm interested in the ${role} role at ${company} and would be glad to connect.`;
  let linkedinMessage = linkedin(title);
  if (linkedinMessage.length > 300) linkedinMessage = linkedin(truncate(title, Math.max(12, title.length - (linkedinMessage.length - 300))));

  return {
    resume,
    coverLetter: paragraphs.join("\n\n"),
    answers: answerList(profile, now),
    recruiterMessage: `Hi, I'm ${firstName}, a ${profile.headline} (${stackLine}) currently at ${current.company}. I've applied for the ${title} role at ${company} and would appreciate you taking a look at my application. I'm happy to share anything else you need.\n\nThank you,\n${profile.name}\n${profile.contact.linkedin}`,
    linkedinMessage,
    emailSubject: `Application for ${title} – ${profile.name}`,
    emailBody: [
      "Dear Hiring Team,",
      `I would like to apply for the ${title} position at ${company}. I am a ${profile.headline} with ${experiencePhrase(profile, now)}, currently ${current.title} at ${current.company}, working mainly with ${stackLine}.`,
      "My resume is attached. I would be glad to share more detail or complete any assessment that is part of your process.",
      `LinkedIn: ${profile.contact.linkedin}\nGitHub: ${profile.contact.github}\nPhone: ${profile.contact.phone}`,
      `Regards,\n${profile.name}`,
    ].join("\n\n"),
  };
}

export function answerList(profile: Profile, now = new Date()): AnswerItem[] {
  return Object.entries(resolvedAnswers(profile, now)).map(([key, a]) => ({ key, question: a.question, answer: a.value, verified: a.verified && a.value !== "", sensitive: a.sensitive }));
}

// ---------------------------------------------------------------- AI tailoring
const Section = z.object({ id: z.string(), bulletIds: z.array(z.string()).describe("Bullet ids from this entry, most relevant to the job first. Include every bullet id exactly once.") });
const DraftSchema = z.object({
  summary: z.string().describe("Professional summary for the top of the resume: two or three sentences."),
  experience: z.array(Section),
  projects: z.array(Section).describe("Projects, most relevant to the job first."),
  coverLetter: z.string().describe("Complete cover letter with greeting and sign-off, 180–260 words, paragraphs separated by blank lines."),
  recruiterMessage: z.string().describe("Short note to a recruiter after applying, under 80 words."),
  linkedinMessage: z.string().describe("LinkedIn connection note. Hard limit: 300 characters."),
  emailSubject: z.string(),
  emailBody: z.string().describe("Email application body, 90–140 words, mentions the attached resume."),
});

function writerSystemPrompt(profile: Profile, now: Date): string {
  const exp = experienceSummary(profile, now);
  return `You prepare job application materials for one candidate, who will review and send them under their own name. Hiring teams read these, so they must sound like a capable early-career developer writing plainly about real work — specific, direct, and free of filler such as "I am excited to", "passionate", or "proven track record".

The one rule that overrides everything else: every statement must be supported by the candidate profile below. The candidate will be asked about anything in these documents at interview, and a claim they cannot back up costs them the job. So:
- Mention only technologies that appear in the profile. If the job asks for something the candidate has not used, leave it out rather than implying familiarity.
- Do not state or imply more experience than they have. As of ${now.toISOString().slice(0, 10)} that is ${exp.label}.
- Do not add numbers, percentages, user counts, team sizes, awards, certifications, or leadership responsibilities that are not in the profile.
- Do not change employers, job titles, dates, or education.

How to tailor: choose which of the candidate's real experience to put first for this job, and connect it to what the posting says the team needs. Resume bullets are reused word for word, so for each experience and project entry you only return the bullet ids in the order that best fits this job.

Write in first person for the letter and messages. Address the letter to the hiring team at the company unless the posting names a contact.

<candidate_profile>
${JSON.stringify({ name: profile.name, headline: profile.headline, summary: profile.summary, contact: profile.contact, skills: profile.skills, additionalSkills: profile.additionalSkills, experience: profile.experience, projects: profile.projects, education: profile.education }, null, 1)}
</candidate_profile>`;
}

function mergeSections(ai: { id: string; bulletIds: string[] }[], base: ResumeSection[], known: Map<string, string[]>, keepBaseOrder: boolean): ResumeSection[] {
  const pick = (id: string, proposed: string[] | undefined, fallback: string[]): ResumeSection => {
    const valid = known.get(id) ?? [];
    const ordered = [...new Set((proposed ?? []).filter((b) => valid.includes(b)))];
    // Anything the model left out is appended, so no real experience is silently dropped.
    for (const b of fallback) if (!ordered.includes(b)) ordered.push(b);
    return { id, bulletIds: ordered };
  };
  const byId = new Map(ai.map((s) => [s.id, s.bulletIds]));
  if (keepBaseOrder) return base.map((s) => pick(s.id, byId.get(s.id), s.bulletIds));
  const order = [...new Set([...ai.map((s) => s.id).filter((id) => known.has(id)), ...base.map((s) => s.id)])];
  return order.map((id) => pick(id, byId.get(id), base.find((s) => s.id === id)!.bulletIds));
}

async function aiMaterials(job: JobFacts, profile: Profile, base: Materials, now: Date): Promise<{ materials: Materials; warnings: string[] }> {
  const have = profileSkillSet(profile);
  const matched = jobSkills(job).filter((s) => have.has(s));
  const draft = await structured({
    system: writerSystemPrompt(profile, now),
    schema: DraftSchema,
    user: `<job_posting>
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || "not stated"} (${job.workMode})

${truncate(job.description, 6_000) || "(No description text was provided by the source.)"}
</job_posting>

Technologies this posting mentions that are on the candidate's resume: ${matched.join(", ") || "none detected"}.

Prepare the application materials for this job.`,
  });

  const warnings: string[] = [];
  const guard = (label: string, text: string, fallback: string, maxLength?: number): string => {
    const problems = checkTruth(text, profile, now);
    if (maxLength && text.length > maxLength) problems.push(`is longer than ${maxLength} characters`);
    if (!text.trim()) problems.push("was empty");
    if (!problems.length) return text.trim();
    warnings.push(`The AI draft of the ${label} ${problems.join("; ")} — replaced with the fact-only template version.`);
    return fallback;
  };
  const expKnown = new Map(profile.experience.map((e) => [e.id, e.bullets.map((b) => b.id)]));
  const projKnown = new Map(profile.projects.map((p) => [p.id, p.bullets.map((b) => b.id)]));
  const summary = guard("summary", draft.summary, base.resume.summary);
  return {
    warnings,
    materials: {
      ...base,
      resume: {
        ...base.resume,
        summary,
        experience: mergeSections(draft.experience, base.resume.experience, expKnown, true),
        projects: mergeSections(draft.projects, base.resume.projects, projKnown, false),
      },
      coverLetter: guard("cover letter", draft.coverLetter, base.coverLetter),
      recruiterMessage: guard("recruiter message", draft.recruiterMessage, base.recruiterMessage),
      linkedinMessage: guard("LinkedIn message", draft.linkedinMessage, base.linkedinMessage, 300),
      emailSubject: guard("email subject", draft.emailSubject, base.emailSubject),
      emailBody: guard("email draft", draft.emailBody, base.emailBody),
    },
  };
}

/** Build the application pack. Uses AI when configured and requested; otherwise (or on failure) the template. */
export async function buildMaterials(job: JobFacts, profile: Profile, opts: { useAi?: boolean; now?: Date } = {}): Promise<PrepareResult> {
  const now = opts.now ?? new Date();
  const base = templateMaterials(job, profile, now);
  if (opts.useAi === false || !env.aiConfigured) return { materials: base, warnings: [], generatedBy: "template" };
  try {
    const { materials, warnings } = await aiMaterials(job, profile, base, now);
    return { materials, warnings, generatedBy: "ai" };
  } catch (e) {
    const reason = e instanceof AiError ? e.message : errorMessage(e);
    log.warn("AI tailoring failed; using template", { reason });
    return { materials: base, warnings: [`AI tailoring was unavailable (${reason}); these are the template versions.`], generatedBy: "template" };
  }
}

/** Truth-check materials the user has edited by hand. Returns warnings only — the user's edits are kept. */
export function reviewMaterials(materials: Materials, profile: Profile, now = new Date()): string[] {
  const fields: [string, string][] = [
    ["summary", materials.resume.summary],
    ["cover letter", materials.coverLetter],
    ["recruiter message", materials.recruiterMessage],
    ["LinkedIn message", materials.linkedinMessage],
    ["email draft", materials.emailBody],
  ];
  const out: string[] = [];
  for (const [label, text] of fields) {
    const problems = checkTruth(text, profile, now);
    if (problems.length) out.push(`The ${label} ${problems.join("; ")}.`);
  }
  if (materials.linkedinMessage.length > 300) out.push("The LinkedIn message is over the 300-character limit for connection notes.");
  return out;
}
