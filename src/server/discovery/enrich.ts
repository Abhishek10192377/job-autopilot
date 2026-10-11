import { htmlToText, truncate } from "../lib/text";
import type { JobFacts } from "../matching/heuristic";
import { classifyJobSkills, extractSkills } from "../matching/lexicon";
import { detectEmploymentType, detectSeniority, detectWorkMode, extractApplyEmail, extractExperience, extractSalary, extractWorkingDays, remoteEligibility } from "./extract";
import { dedupeKey, normalizeUrl } from "./normalize";
import type { RawJob } from "./types";

export interface EnrichedJob extends JobFacts {
  source: string;
  sourceId: string;
  url: string;
  applyUrl: string;
  urlKey: string;
  dedupeKey: string;
  applyEmail: string | null;
  postedAt: Date | null;
  deadline: Date | null;
  attribution?: string;
}

/** Turn a raw listing into the structured record the matcher and dashboard use. */
export function enrich(raw: RawJob): EnrichedJob {
  const title = raw.title.trim();
  const company = raw.company.trim();
  const location = (raw.location ?? "").trim();
  const description = truncate(raw.descriptionText?.trim() || htmlToText(raw.descriptionHtml), 30_000);
  const workMode = raw.tags?.includes("hybrid") ? "hybrid" : detectWorkMode(title, location, description, raw.remote);
  const regions = (raw.remoteRegions ?? []).filter(Boolean);
  const exp = extractExperience(description);
  const skills = classifyJobSkills(description, title);
  for (const s of extractSkills((raw.tags ?? []).join(", "))) {
    if (!skills.required.includes(s) && !skills.preferred.includes(s)) skills.required.push(s);
  }
  const parsedSalary = extractSalary(description);
  const salary = raw.salary?.min || raw.salary?.max ? raw.salary : parsedSalary ?? (raw.salary?.raw ? raw.salary : null);

  return {
    source: raw.source,
    sourceId: raw.sourceId,
    title,
    company,
    url: raw.url,
    applyUrl: raw.applyUrl || raw.url,
    urlKey: normalizeUrl(raw.url),
    dedupeKey: dedupeKey(company, title),
    location,
    workMode,
    remoteRegions: regions,
    remoteEligibility: remoteEligibility(workMode, regions, location, description),
    employmentType: detectEmploymentType(raw.employmentType, title, description),
    experienceMin: exp.min,
    experienceMax: exp.max,
    seniority: detectSeniority(title),
    skillsRequired: skills.required,
    skillsPreferred: skills.preferred,
    salary: salary ?? null,
    workingDays: extractWorkingDays(description),
    description,
    applyEmail: extractApplyEmail(description),
    postedAt: raw.postedAt ?? null,
    deadline: raw.deadline ?? null,
    attribution: raw.attribution,
  };
}
