import { z } from "zod";
import { COMPONENT_KEYS, COMPONENT_LABEL, COMPONENT_MAX, type MatchResult, type Profile, type Settings } from "@/shared/types";
import { structured } from "../ai/client";
import { env } from "../config/env";
import { truncate } from "../lib/text";
import { experienceSummary } from "../profile/profile";
import { scoreJob, type JobFacts } from "./heuristic";

const Component = z.object({
  score: z.number().describe("Points awarded, between 0 and this component's maximum."),
  unknown: z.boolean().describe("True if the posting does not publish enough information to judge this component."),
  notes: z.array(z.string()).describe("One to three short, specific sentences justifying the score, addressed to the candidate as 'you'."),
});

const MatchSchema = z.object({
  skills: Component,
  experience: Component,
  role: Component,
  location: Component,
  other: Component,
  strengths: z.array(z.string()).describe("Up to four concrete reasons this job fits the candidate."),
  gaps: z.array(z.string()).describe("Up to four concrete gaps or risks, including any experience gap in years."),
  summary: z.string().describe("Two sentences: the overall verdict and the single most important caveat."),
});

/**
 * The profile as compact plain text. Scoring needs the skills and what the candidate actually did,
 * not the full JSON; a shorter prompt matters a great deal for a local model's speed.
 */
function profileBrief(profile: Profile): string {
  const skills = profile.skills.map((g) => `${g.category}: ${g.items.join(", ")}`);
  if (profile.additionalSkills.length) skills.push(`Also used: ${profile.additionalSkills.join(", ")}`);
  const experience = profile.experience.map(
    (e) => `${e.title}, ${e.company} (${e.type}, ${e.start} to ${e.end ?? "present"}, ${e.location})\n${e.bullets.map((b) => `- ${b.text}`).join("\n")}`,
  );
  const projects = profile.projects.map((p) => `- ${p.name}: ${p.stack.join(", ")}`);
  const degree = profile.education[0];
  return [
    `${profile.headline}. ${profile.summary}`,
    `SKILLS\n${skills.join("\n")}`,
    `EXPERIENCE\n${experience.join("\n\n")}`,
    `PROJECTS\n${projects.join("\n")}`,
    degree ? `EDUCATION\n${degree.degree}, ${degree.institution} (${degree.years})` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function matchSystemPrompt(profile: Profile, settings: Settings, now: Date): string {
  const exp = experienceSummary(profile, now);
  return `You assess how well a job posting fits one specific candidate, so they can decide where to spend their application effort. Your assessment is shown to the candidate directly, next to the posting. Being accurate matters more than being encouraging: an inflated score wastes their time on applications that go nowhere, and a deflated one hides a real opportunity.

Score five components. Each has a fixed maximum:
- skills (max ${COMPONENT_MAX.skills}): how much of the technology the posting requires is on the candidate's resume. Weigh required skills well above nice-to-haves, and the technologies the role is built around above incidental mentions.
- experience (max ${COMPONENT_MAX.experience}): the candidate's actual experience against what the posting asks for. A gap of up to a year is small; do not zero a job just because it asks for slightly more than they have, but say plainly how large the gap is.
- role (max ${COMPONENT_MAX.role}): how closely the day-to-day responsibilities match the roles they target and the work they have actually done.
- location (max ${COMPONENT_MAX.location}): work arrangement and geography against their preferences. A remote job that only hires in a region outside India scores near zero here.
- other (max ${COMPONENT_MAX.other}): employment type, working days, and any hard requirement (degree, language, work authorisation, shift timing).

When the posting does not publish the information a component needs, mark that component unknown and award about half its points. Never treat missing information as satisfied, and never assume the candidate has a skill, qualification or work authorisation that is not in their profile below.

Scoring rules:
- The points must agree with your notes. If your note says a requirement is met, give that component its full points; do not write that it is met and then award half.
- Experience: when the candidate has at least the years the posting asks for, experience is ${COMPONENT_MAX.experience}. Example: the posting asks for 1+ years and the candidate has 1.8 years, so experience is ${COMPONENT_MAX.experience}. Example: the posting asks for 2+ years and the candidate has 1.8, a small gap, so about 21.
- Location: a remote job open worldwide or open to India is ${COMPONENT_MAX.location}. A remote job that does not say which countries can apply is unknown, about 6.
- Skills: count only technologies in the candidate profile. If the role is built around a technology the candidate lacks (for example a PHP and WordPress job), skills is low even when general web skills overlap.
- "unknown" is true ONLY when the posting says nothing at all about that component. If the posting names any technology, skills is not unknown. If it states years or a seniority level, experience is not unknown. If it states remote, hybrid, on-site or a place, location is not unknown.
- The summary must match the total: do not call a job a good fit when the points add up to a weak one.

Today is ${now.toISOString().slice(0, 10)}. The candidate's experience as of today: ${exp.label} (about ${exp.totalYears.toFixed(1)} years in total, ${exp.fullTimeYears.toFixed(1)} of it full-time).

<candidate_profile>
${profileBrief(profile)}
</candidate_profile>

<candidate_preferences>
Based in India. Target titles: ${settings.preferredTitles.join(", ")}.
Location preference, best first: remote roles open to India; remote roles hiring internationally; on-site or hybrid in ${settings.preferredCities.join(", ")}; other Indian cities.
Wants: ${settings.employmentTypes.join(" / ")} employment, reasonable hours, Saturday and Sunday off, room to grow. Comfortable with roles asking for roughly 1–2 years; open to junior, associate and entry-level roles.
</candidate_preferences>`;
}

function describeJob(job: JobFacts): string {
  return `<job_posting>
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || "not stated"}
Work arrangement (as detected): ${job.workMode}${job.remoteRegions.length ? `; remote hiring regions listed: ${job.remoteRegions.join(", ")}` : ""}
Employment type (as detected): ${job.employmentType}
Salary: ${job.salary?.raw ?? (job.salary?.min ? `${job.salary.min}–${job.salary.max ?? "?"} ${job.salary.currency ?? ""} per ${job.salary.period ?? "?"}` : "not published")}

${truncate(job.description, 6_000) || "(The source provided no description text.)"}
</job_posting>

Assess this posting for the candidate.`;
}

const clamp = (n: number, max: number) => Math.round(Math.max(0, Math.min(max, n)) * 10) / 10;

// ---------------------------------------------------------------- hybrid scoring (local models)
// A small local model reads a posting well but is unreliable at awarding points and at checking facts
// such as years or a degree. So the rule-based engine keeps skills, experience, location and other;
// the model only judges the role and writes the explanation.
const HybridSchema = z.object({
  role: z.object({
    score: z.number().describe(`Points for the role, between 0 and ${COMPONENT_MAX.role}.`),
    notes: z.array(z.string()).describe("One or two short sentences justifying the role score, addressed to the candidate as 'you'."),
  }),
  strengths: z.array(z.string()).describe("Up to four concrete reasons this job fits the candidate."),
  gaps: z.array(z.string()).describe("Up to four concrete gaps or risks. Only things the posting asks for that the profile lacks."),
  summary: z.string().describe("Two sentences: who this job suits and the single most important caveat. No numbers or scores."),
});

function hybridSystemPrompt(profile: Profile, settings: Settings): string {
  return `You help one candidate decide whether a job posting is worth applying to. Your text is shown to the candidate next to the posting, so it must be accurate.

A program has already scored four areas of the fit: technical skills, experience, location and other requirements. Those results are given to you with each posting under <already_scored>. Treat them as correct. Do not re-score them and do not contradict them.

You do two things:
1. Score the role from 0 to ${COMPONENT_MAX.role}: how closely the day-to-day work in the posting matches the roles the candidate targets and the work they have actually done.
   - 17 to ${COMPONENT_MAX.role}: the same kind of work they do now.
   - 10 to 16: related work where a good part overlaps.
   - 0 to 9: a different specialisation, or work built around technology they have not used.
2. Write the strengths, the gaps and a two-sentence summary, addressed to the candidate as "you".

Rules for what you write:
- Use only facts from the candidate profile and the posting. Before writing that the candidate lacks something, check the profile: if it is there, it is not a gap.
- A gap is something the posting asks for that the profile does not have. Say when it is only a nice-to-have.
- Take the skills, experience and location facts from <already_scored> rather than working them out again.
- Do not put any score or number of points in the summary.
- The summary is exactly two plain sentences: first what in the posting matches the candidate's work, then the main caveat. Do not judge the overall fit ("strong fit", "good fit"), since the verdict is added separately, and do not praise the job or the company ("exciting opportunity", "cutting-edge").

<candidate_profile>
${profileBrief(profile)}
</candidate_profile>

<candidate_preferences>
Based in India. Target titles: ${settings.preferredTitles.join(", ")}.
</candidate_preferences>`;
}

async function hybridScoreJob(job: JobFacts, profile: Profile, settings: Settings, now: Date, model: string): Promise<MatchResult> {
  const base = scoreJob(job, profile, settings, now);
  const fixed = COMPONENT_KEYS.filter((k) => k !== "role");
  const scored = fixed.map((k) => `${COMPONENT_LABEL[k]}: ${base.components[k].score} of ${base.components[k].max}. ${base.components[k].notes.join(" ")}`);
  const out = await structured({
    model,
    system: hybridSystemPrompt(profile, settings),
    user: `${describeJob(job)}\n\n<already_scored>\n${scored.join("\n")}\n</already_scored>`,
    schema: HybridSchema,
    effort: "low",
  });
  const components = { ...base.components, role: { score: clamp(out.role.score, COMPONENT_MAX.role), max: COMPONENT_MAX.role, unknown: false, notes: out.role.notes.slice(0, 3) } };
  const parts = Object.values(components);
  const total = Math.round(parts.reduce((a, c) => a + c.score, 0));
  // The verdict comes from the total, so the summary can never disagree with the points.
  const verdict = total >= 75 ? "Strong match" : total >= settings.minScore ? "Good match" : total >= 45 ? "Partial match" : "Weak match";
  return {
    total,
    confidence: Math.round(parts.filter((c) => !c.unknown).reduce((a, c) => a + c.max, 0)),
    components,
    strengths: out.strengths.slice(0, 4),
    gaps: out.gaps.slice(0, 4),
    summary: `${verdict} (${total}/100). ${out.summary}`,
    engine: "ai",
    model,
    scoredAt: now,
  };
}

export async function aiScoreJob(job: JobFacts, profile: Profile, settings: Settings, now = new Date()): Promise<MatchResult> {
  const model = env.aiMatchModel;
  if (env.aiProvider === "ollama") return hybridScoreJob(job, profile, settings, now, model);
  const out = await structured({ model, system: matchSystemPrompt(profile, settings, now), user: describeJob(job), schema: MatchSchema, effort: "low" });
  const components = Object.fromEntries(
    COMPONENT_KEYS.map((k) => [k, { score: clamp(out[k].score, COMPONENT_MAX[k]), max: COMPONENT_MAX[k], unknown: out[k].unknown, notes: out[k].notes.slice(0, 4) }]),
  ) as MatchResult["components"];
  const parts = Object.values(components);
  return {
    // The total is always computed here from the components, never taken from the model.
    total: Math.round(parts.reduce((a, c) => a + c.score, 0)),
    confidence: parts.filter((c) => !c.unknown).reduce((a, c) => a + c.max, 0),
    components,
    strengths: out.strengths.slice(0, 4),
    gaps: out.gaps.slice(0, 4),
    summary: out.summary,
    engine: "ai",
    model,
    scoredAt: now,
  };
}
