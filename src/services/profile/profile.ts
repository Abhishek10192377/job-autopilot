import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Profile } from "@/types";
import { connectDb } from "../../config/db";
import { ProfileModel } from "../../models";
import { expandImplied, extractSkills } from "../matching/lexicon";

const PROFILE_ID = "me";

export async function loadSeedProfile(): Promise<Profile> {
  const raw = await readFile(path.resolve(process.cwd(), "seed", "profile.json"), "utf8");
  return JSON.parse(raw) as Profile;
}

/** The master profile. Seeded once from seed/profile.json (transcribed from the original resume). */
export async function getProfile(): Promise<Profile> {
  await connectDb();
  const doc = await ProfileModel.findById(PROFILE_ID).lean();
  if (doc) return doc.value;
  const seed = await loadSeedProfile();
  await ProfileModel.updateOne({ _id: PROFILE_ID }, { $setOnInsert: { value: seed, updatedAt: new Date() } }, { upsert: true });
  return seed;
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  await connectDb();
  await ProfileModel.updateOne({ _id: PROFILE_ID }, { $set: { value: profile, updatedAt: new Date() } }, { upsert: true });
  return profile;
}

function monthsBetween(start: string, end: string | null, now: Date): number {
  const [sy, sm] = start.split("-").map(Number);
  const e = end ? end.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  // Inclusive of the end month for finished roles (Jan–Jun = 6 months).
  return Math.max(0, (e[0] - sy) * 12 + (e[1] - sm) + (end ? 1 : 0));
}

function span(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} year${y > 1 ? "s" : ""}` : "", m ? `${m} month${m > 1 ? "s" : ""}` : ""].filter(Boolean).join(" ") || "under a month";
}

export interface ExperienceSummary {
  fullTimeMonths: number;
  internshipMonths: number;
  totalYears: number;
  fullTimeYears: number;
  label: string;
}

/** Experience computed from the resume's dates as of today — never rounded up. */
export function experienceSummary(profile: Profile, now = new Date()): ExperienceSummary {
  let fullTimeMonths = 0;
  let internshipMonths = 0;
  for (const e of profile.experience) {
    const months = monthsBetween(e.start, e.end, now);
    if (e.type === "internship") internshipMonths += months;
    else fullTimeMonths += months;
  }
  const parts = [];
  if (fullTimeMonths) parts.push(`${span(fullTimeMonths)} full-time`);
  if (internshipMonths) parts.push(`a ${internshipMonths}-month internship`);
  return {
    fullTimeMonths,
    internshipMonths,
    fullTimeYears: fullTimeMonths / 12,
    totalYears: (fullTimeMonths + internshipMonths) / 12,
    label: parts.join(" plus ") || "no recorded experience",
  };
}

/** Skills the profile can claim: the resume's skills section, project stacks, and what those imply. */
export function profileSkillSet(profile: Profile): Set<string> {
  const text = [
    ...profile.skills.flatMap((g) => g.items),
    ...profile.additionalSkills,
    ...profile.projects.flatMap((p) => p.stack),
  ].join(", ");
  return expandImplied(extractSkills(text));
}

/** Technologies that may be *mentioned* in generated text (includes ones named in resume bullets, e.g. a migration target). */
export function mentionableSkills(profile: Profile): Set<string> {
  const text = [
    profile.summary,
    ...profile.experience.flatMap((e) => e.bullets.map((b) => b.text)),
    ...profile.projects.flatMap((p) => p.bullets.map((b) => b.text)),
  ].join("\n");
  return new Set([...profileSkillSet(profile), ...extractSkills(text)]);
}

/** Answers with computed values filled in (total experience is derived from dates). */
export function resolvedAnswers(profile: Profile, now = new Date()): Profile["answers"] {
  const out: Profile["answers"] = JSON.parse(JSON.stringify(profile.answers));
  if (out.totalExperience && !out.totalExperience.value) {
    out.totalExperience.value = experienceSummary(profile, now).label;
  }
  return out;
}
