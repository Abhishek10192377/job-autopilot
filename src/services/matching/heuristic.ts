// Rule-based compatibility score. Deterministic, free, and always available; the AI engine refines it when configured.
import { COMPONENT_MAX, type MatchComponent, type MatchResult, type Profile, type RemoteEligibility, type Salary, type Settings, type WorkMode } from "@/types";
import { detectBlockers, detectIndianCity, isIndiaLocation } from "../discovery/extract";
import { normalizeTitle } from "../discovery/normalize";
import { experienceSummary, profileSkillSet } from "../profile/profile";
import { CORE_STACK, extractSkills, isGeneric } from "./lexicon";

export interface JobFacts {
  title: string;
  company: string;
  description: string;
  location: string;
  workMode: WorkMode;
  remoteEligibility: RemoteEligibility;
  remoteRegions: string[];
  employmentType: string;
  experienceMin?: number | null;
  experienceMax?: number | null;
  seniority: string;
  skillsRequired: string[];
  skillsPreferred: string[];
  workingDays: string;
  salary?: Salary | null;
}

const OFF_TARGET = /\b(devops|sre|site reliability|data (?:engineer|scientist|analyst)|analytics engineer|machine learning|ml engineer|ai engineer|research engineer|qa|quality assurance|test(?:ing)? engineer|sdet|automation engineer|security|embedded|firmware|mobile|android|ios|game|blockchain|salesforce|sap|infrastructure|platform engineer|cloud engineer|database administrator|dba|systems engineer|solutions architect|forward deployed|developer advocate|devrel)\b/;
const FRONT_FAMILY = /\b(frontend|react|nextjs|ui (?:developer|engineer)|web (?:developer|engineer)|javascript|typescript|mern|fullstack)\b/;
const GENERIC_DEV = /\b(software (?:engineer|developer)|sde|swe|application developer|product engineer|developer|engineer|programmer)\b/;

const round1 = (n: number) => Math.round(n * 10) / 10;
const list = (items: string[], max = 8) => (items.length > max ? `${items.slice(0, max).join(", ")} +${items.length - max} more` : items.join(", "));

function scoreSkills(job: JobFacts, have: Set<string>): { component: MatchComponent; ratio: number | null; matched: string[]; missing: string[] } {
  const max = COMPONENT_MAX.skills;
  const req = job.skillsRequired.filter((s) => !isGeneric(s));
  const pref = job.skillsPreferred.filter((s) => !isGeneric(s));
  if (!req.length && !pref.length) {
    return {
      component: { score: round1(max * 0.5), max, unknown: true, notes: ["The posting does not name specific technologies, so skills fit is unknown (half credit, not assumed)."] },
      ratio: null,
      matched: [],
      missing: [],
    };
  }
  const inTitle = new Set(extractSkills(job.title));
  const weight = (s: string) => (inTitle.has(s) ? 3 : CORE_STACK.has(s) ? 2 : 1);
  const ratioOf = (skills: string[]) => {
    const total = skills.reduce((a, s) => a + weight(s), 0);
    return total ? skills.filter((s) => have.has(s)).reduce((a, s) => a + weight(s), 0) / total : null;
  };
  const reqRatio = ratioOf(req);
  const prefRatio = ratioOf(pref);
  const ratio = reqRatio !== null && prefRatio !== null ? 0.8 * reqRatio + 0.2 * prefRatio : (reqRatio ?? prefRatio ?? 0);
  const matched = [...req, ...pref].filter((s) => have.has(s));
  const missingReq = req.filter((s) => !have.has(s));
  const missingPref = pref.filter((s) => !have.has(s));
  const notes: string[] = [];
  if (matched.length) notes.push(`On your resume: ${list(matched)}.`);
  if (missingReq.length) notes.push(`Asked for but not on your resume: ${list(missingReq)}.`);
  if (missingPref.length) notes.push(`Nice-to-have you lack: ${list(missingPref)}.`);
  return { component: { score: round1(max * ratio), max, unknown: false, notes }, ratio, matched, missing: missingReq };
}

function scoreExperience(job: JobFacts, profile: Profile, settings: Settings, now: Date): MatchComponent {
  const max = COMPONENT_MAX.experience;
  const exp = experienceSummary(profile, now);
  const mine = exp.totalYears;
  const notes: string[] = [];
  const required = job.experienceMin;
  if (required !== null && required !== undefined) {
    const gap = required - mine;
    let score = gap <= 0 ? 25 : gap <= 0.5 ? 22 : gap <= 1 ? 18 : gap <= 2 ? 12 : gap <= 3 ? 6 : 2;
    const range = job.experienceMax ? `${required}–${job.experienceMax}` : `${required}+`;
    notes.push(`Asks for ${range} years; you have ${exp.label} (about ${mine.toFixed(1)} years).`);
    if (gap > 0) notes.push(`Gap of roughly ${gap.toFixed(1)} year${gap >= 1.5 ? "s" : ""} — ${gap <= 1 ? "small enough to be worth applying" : gap <= 2 ? "a stretch, but not disqualifying" : "a significant stretch"}.`);
    if (required > settings.maxExperience) notes.push(`Above your configured maximum of ${settings.maxExperience} years.`);
    if (job.seniority === "senior") score = Math.min(score, 12);
    if (job.seniority === "lead") score = Math.min(score, 8);
    return { score, max, unknown: false, notes };
  }
  switch (job.seniority) {
    case "junior":
      return { score: 23, max, unknown: false, notes: [`Junior / associate-level title; you have ${exp.label}.`] };
    case "intern":
      return { score: 12, max, unknown: false, notes: [`Internship-level role; you already have ${exp.label}.`] };
    case "mid":
      return { score: 14, max, unknown: true, notes: ["Mid-level title with no stated years — typically 2–4 years, so likely a modest gap."] };
    case "senior":
      return { score: 6, max, unknown: true, notes: [`Senior title with no stated years — typically 5+ years against your ${mine.toFixed(1)}.`] };
    case "lead":
      return { score: 3, max, unknown: true, notes: ["Lead / staff / principal title — well beyond your current experience level."] };
    default:
      return { score: round1(max * 0.5), max, unknown: true, notes: ["No experience requirement is published (half credit, not assumed)."] };
  }
}

function scoreRole(job: JobFacts, have: Set<string>, settings: Settings, skillRatio: number | null): MatchComponent {
  const max = COMPONENT_MAX.role;
  const t = normalizeTitle(job.title);
  const notes: string[] = [];
  const titleSkills = extractSkills(job.title).filter((s) => CORE_STACK.has(s));
  const titleMissing = titleSkills.filter((s) => !have.has(s));
  const titleMatched = titleSkills.filter((s) => have.has(s));
  const preferred = settings.preferredTitles.find((p) => {
    const words = normalizeTitle(p).split(" ").filter((x) => !["developer", "engineer", "stack"].includes(x));
    return words.length > 0 && words.every((x) => t.split(" ").includes(x));
  });

  let score: number;
  if (OFF_TARGET.test(t) && !FRONT_FAMILY.test(t)) {
    score = 3;
    notes.push("A different specialisation from the frontend / full-stack web roles you target.");
  } else if (FRONT_FAMILY.test(t)) {
    score = 20;
    notes.push(preferred ? `Matches your target role "${preferred}".` : "Frontend / full-stack web role — your core area.");
  } else if (/\bnode\b/.test(t)) {
    score = 15;
    notes.push("Node.js backend role — covered by your Node.js and Express work.");
  } else if (/\bbackend\b/.test(t)) {
    score = job.skillsRequired.includes("Node.js") ? 13 : 9;
    notes.push("Backend-focused role; your experience leans frontend / full-stack.");
  } else if (GENERIC_DEV.test(t)) {
    score = skillRatio === null ? 14 : skillRatio >= 0.6 ? 17 : skillRatio < 0.3 ? 9 : 14;
    notes.push("General software developer title — fit depends on the stack (see skills).");
  } else {
    score = 6;
    notes.push("Title does not clearly match your target roles.");
  }
  if (titleMissing.length && !titleMatched.length) {
    score = Math.min(score, 6);
    notes.push(`The role is built around ${titleMissing.join(", ")}, which is not on your resume.`);
  } else if (titleMissing.length) {
    score = Math.max(0, score - 4);
    notes.push(`The title also names ${titleMissing.join(", ")}, which is not on your resume.`);
  }
  if (job.seniority === "lead") {
    score = Math.min(score, 8);
    notes.push("Lead / staff-level responsibilities.");
  }
  return { score, max, unknown: false, notes };
}

function scoreLocation(job: JobFacts, settings: Settings): MatchComponent {
  const max = COMPONENT_MAX.location;
  const city = detectIndianCity(job.location);
  const preferredCity = settings.preferredCities.find((c) => job.location.toLowerCase().includes(c.toLowerCase()));
  const india = isIndiaLocation(job.location);
  const where = job.location || "location not stated";
  if (job.workMode === "remote") {
    if (job.remoteEligibility === "eligible") return { score: 10, max, unknown: false, notes: [`Remote and open to candidates in India (${job.remoteRegions.join(", ") || where}).`] };
    if (job.remoteEligibility === "restricted") return { score: 1, max, unknown: false, notes: [`Remote, but restricted to ${job.remoteRegions.join(", ") || job.location || "another region"} — India is not listed.`] };
    return { score: 6, max, unknown: true, notes: ["Remote, but the posting does not say which countries can apply."] };
  }
  const label = job.workMode === "unknown" ? "Work arrangement not stated" : job.workMode === "hybrid" ? "Hybrid" : "On-site";
  if (preferredCity) return { score: job.workMode === "hybrid" ? 9 : 8, max, unknown: job.workMode === "unknown", notes: [`${label} in ${preferredCity}, one of your preferred cities.`] };
  if (city || india) return { score: 6, max, unknown: job.workMode === "unknown", notes: [`${label} in ${where} — in India, outside your preferred cities.`] };
  if (job.location) return { score: 0, max, unknown: false, notes: [`${label} in ${where} — outside India, so it would need relocation and work authorisation.`] };
  return { score: round1(max * 0.5), max, unknown: true, notes: ["Neither location nor work arrangement is published (half credit, not assumed)."] };
}

function scoreOther(job: JobFacts, settings: Settings): MatchComponent {
  const max = COMPONENT_MAX.other;
  const notes: string[] = [];
  let score = 0;
  let unknown = false;

  // Employment type — 4 points
  if (job.employmentType === "unknown") {
    score += 2;
    unknown = true;
    notes.push("Employment type not stated.");
  } else if (settings.employmentTypes.includes(job.employmentType)) {
    score += 4;
    notes.push(`${job.employmentType[0].toUpperCase()}${job.employmentType.slice(1)} role, as you prefer.`);
  } else {
    notes.push(`This is a ${job.employmentType} role; you prefer ${settings.employmentTypes.join(" / ")}.`);
  }

  // Working days — 3 points
  if (job.workingDays === "Mon–Fri") {
    score += 3;
    notes.push("Five-day week / weekends off is stated.");
  } else if (job.workingDays === "unknown") {
    score += 1.5;
    unknown = true;
    notes.push("Working days not stated — confirm Saturday and Sunday are off.");
  } else {
    notes.push("The posting mentions a six-day week or Saturday working.");
  }

  // Hard requirements — 3 points
  if (job.description.length < 300) {
    score += 1.5;
    unknown = true;
    notes.push("Description too short to check for other requirements.");
  } else {
    const blockers = detectBlockers(job.description);
    if (blockers.length) notes.push(...blockers.map((b) => `${b}.`));
    else score += 3;
  }

  if (settings.minSalary && job.salary?.max && job.salary.currency === settings.minSalary.currency && job.salary.max < settings.minSalary.amount) {
    notes.push(`Published salary (${job.salary.raw ?? job.salary.max}) is below your minimum.`);
  }
  return { score: round1(score), max, unknown, notes };
}

export function scoreJob(job: JobFacts, profile: Profile, settings: Settings, now = new Date()): MatchResult {
  const have = profileSkillSet(profile);
  const s = scoreSkills(job, have);
  const components = {
    skills: s.component,
    experience: scoreExperience(job, profile, settings, now),
    role: scoreRole(job, have, settings, s.ratio),
    location: scoreLocation(job, settings),
    other: scoreOther(job, settings),
  };
  const parts = Object.values(components);
  const total = Math.round(parts.reduce((a, c) => a + c.score, 0));
  const confidence = Math.round(parts.filter((c) => !c.unknown).reduce((a, c) => a + c.max, 0));

  const strengths: string[] = [];
  const gaps: string[] = [];
  for (const c of parts) {
    const ratio = c.score / c.max;
    if (c.unknown) continue;
    if (ratio >= 0.75) strengths.push(c.notes[0]);
    else if (ratio < 0.5) gaps.push(...c.notes.slice(0, 2));
  }
  if (s.missing.length && !gaps.some((g) => g.startsWith("Asked for"))) gaps.push(`Asked for but not on your resume: ${list(s.missing)}.`);
  const unknowns = parts.filter((c) => c.unknown).length;
  const verdict = total >= 75 ? "Strong match" : total >= settings.minScore ? "Good match" : total >= 45 ? "Partial match" : "Weak match";
  const summary = `${verdict} (${total}/100)${unknowns ? `, with ${unknowns} of 5 areas resting on information the posting does not publish` : ""}.`;

  return { total, confidence, components, strengths, gaps, summary, engine: "heuristic", scoredAt: now };
}

function inPreferredCountry(location: string, settings: Settings): boolean {
  const countries = settings.preferredCountries;
  if (!countries.length) return true;
  return countries.some((c) => location.toLowerCase().includes(c.toLowerCase())) || (countries.some((c) => /^india$/i.test(c)) && isIndiaLocation(location));
}

/**
 * Does this job meet the configured eligibility criteria? A job that does not is still listed with its score
 * and the reasons; it is just not counted as a match or picked up by automation.
 */
export function qualifies(job: JobFacts, match: MatchResult, settings: Settings): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (match.total < settings.minScore) reasons.push(`Score ${match.total} is below your minimum of ${settings.minScore}.`);
  if (settings.remoteOnly && job.workMode !== "remote") reasons.push("Remote-only mode is on and this role is not remote.");
  if (job.experienceMin != null && job.experienceMin > settings.maxExperience) reasons.push(`Asks for ${job.experienceMin}+ years of experience, above your maximum of ${settings.maxExperience}.`);
  if (job.workMode === "remote") {
    if (job.remoteEligibility === "restricted") reasons.push(`Remote, but only for candidates in ${job.remoteRegions.join(", ") || job.location || "another region"}.`);
  } else if (job.location && !inPreferredCountry(job.location, settings)) {
    reasons.push(`Based in ${job.location}, outside ${settings.preferredCountries.join(" / ")} — it would need relocation and work authorisation.`);
  }
  if (job.employmentType !== "unknown" && !settings.employmentTypes.includes(job.employmentType)) reasons.push(`Employment type is ${job.employmentType}.`);
  if (settings.minSalary && job.salary?.max && job.salary.currency === settings.minSalary.currency && job.salary.max < settings.minSalary.amount) {
    reasons.push("Published salary is below your minimum.");
  }
  return { ok: reasons.length === 0, reasons };
}
