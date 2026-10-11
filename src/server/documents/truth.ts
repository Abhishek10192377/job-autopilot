// Guards against fabricated claims in generated application text.
// Everything written for an application is checked against the master profile before it is saved.
import type { Profile } from "@/shared/types";
import { extractSkills } from "../matching/lexicon";
import { experienceSummary, mentionableSkills } from "../profile/profile";

function profileText(profile: Profile): string {
  return [
    profile.summary,
    ...profile.experience.flatMap((e) => [e.company, e.title, ...e.bullets.map((b) => b.text)]),
    ...profile.projects.flatMap((p) => [p.name, ...p.bullets.map((b) => b.text)]),
    ...profile.education.flatMap((e) => [e.institution, e.degree, e.detail]),
  ].join("\n");
}

/**
 * Returns a list of problems; an empty list means the text makes no claim the profile cannot back.
 * Checks: technologies not on the resume, inflated years of experience, invented metrics, unheld degrees.
 */
export function checkTruth(text: string, profile: Profile, now = new Date()): string[] {
  const problems: string[] = [];
  const allowed = mentionableSkills(profile);
  for (const skill of extractSkills(text)) {
    if (!allowed.has(skill)) problems.push(`mentions ${skill}, which is not on your resume`);
  }

  const exp = experienceSummary(profile, now);
  const yearClaim = /(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?!\s*old)/gi;
  let m: RegExpExecArray | null;
  while ((m = yearClaim.exec(text))) {
    const n = Number(m[1]);
    // Year-long spans that are facts on the resume (e.g. a 4-year degree) are not experience claims.
    if (n > exp.totalYears + 0.05 && !/degree|b\.?tech|program/i.test(text.slice(m.index, m.index + 60))) {
      problems.push(`claims ${m[0].trim()} of experience; your resume supports about ${exp.totalYears.toFixed(1)}`);
    }
  }

  const source = profileText(profile);
  for (const metric of text.match(/\d+(?:\.\d+)?\s?%|\b\d+(?:,\d{3})+\+?|\b\d+\s?[kKmM]\+?\b|\b\d+x\b/g) ?? []) {
    if (!source.includes(metric.trim())) problems.push(`includes the figure "${metric.trim()}", which is not on your resume`);
  }

  for (const [re, label] of [
    [/\b(master(?:'|’)?s|m\.?\s?tech|m\.?sc|mba|mca)\b/i, "a postgraduate degree"],
    [/\bph\.?d\b|\bdoctorate\b/i, "a doctorate"],
    [/\b(certified|certification)\b/i, "a certification"],
    [/\b(led|managed|mentored) (?:a |the )?team\b/i, "leading or managing a team"],
  ] as [RegExp, string][]) {
    if (re.test(text) && !re.test(source)) problems.push(`refers to ${label}, which is not on your resume`);
  }
  return [...new Set(problems)];
}
