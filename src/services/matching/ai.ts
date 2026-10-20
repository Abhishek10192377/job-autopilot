import { z } from "zod";
import { COMPONENT_KEYS, COMPONENT_LABEL, COMPONENT_MAX, type MatchResult, type Profile, type Settings } from "@/types";
import { structured } from "../aiService";
import { env } from "../../config/env";
import { truncate } from "../../utils/text";
import { scoreJob, type JobFacts } from "./heuristic";

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
    system: hybridSystemPrompt(profile, settings),
    user: `${describeJob(job)}\n\n<already_scored>\n${scored.join("\n")}\n</already_scored>`,
    schema: HybridSchema,
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
  return hybridScoreJob(job, profile, settings, now, env.ollamaModel);
}
