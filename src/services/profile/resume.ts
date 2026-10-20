// Reads the original resume PDF and checks the stored profile against it.
// The resume file is the source of truth; it is stored once and never modified.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Profile } from "@/types";
import { env } from "../../config/env";
import { extractSkills } from "../matching/lexicon";
import { mentionableSkills } from "./profile";

export interface ParsedResume {
  text: string;
  pages: number;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  github: string | null;
  skills: string[];
  sections: string[];
}

const SECTION = /^(technical skills|skills|experience|work experience|professional experience|technical projects|projects|education|certifications?|achievements|summary|profile)$/i;

export function parseResumeText(text: string, pages = 1): ParsedResume {
  const find = (re: RegExp) => re.exec(text)?.[0] ?? null;
  return {
    text,
    pages,
    email: find(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i),
    phone: find(/\+?\d[\d\s-]{8,14}\d/)?.replace(/\s+/g, " ").trim() ?? null,
    linkedin: find(/linkedin\.com\/in\/[\w-]+/i),
    github: find(/github\.com\/[\w-]+/i),
    skills: extractSkills(text),
    sections: text.split("\n").map((l) => l.trim()).filter((l) => SECTION.test(l)),
  };
}

export async function parseResumePdf(data: Uint8Array): Promise<ParsedResume> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return parseResumeText(text, totalPages);
}

const digits = (s: string) => s.replace(/\D/g, "").slice(-10);

/** Differences between the resume file and the stored profile. Empty when they agree. */
export function compareResume(parsed: ParsedResume, profile: Profile): string[] {
  const out: string[] = [];
  const lower = parsed.text.toLowerCase().replace(/\s+/g, " ");
  if (parsed.email && parsed.email.toLowerCase() !== profile.contact.email.toLowerCase()) out.push(`Email differs: the resume has ${parsed.email}, the profile has ${profile.contact.email}.`);
  if (parsed.phone && digits(parsed.phone) !== digits(profile.contact.phone)) out.push(`Phone differs: the resume has ${parsed.phone}, the profile has ${profile.contact.phone}.`);
  if (parsed.linkedin && !profile.contact.linkedin.toLowerCase().includes(parsed.linkedin.toLowerCase())) out.push(`LinkedIn differs: the resume has ${parsed.linkedin}.`);
  if (parsed.github && !profile.contact.github.toLowerCase().includes(parsed.github.toLowerCase())) out.push(`GitHub differs: the resume has ${parsed.github}.`);

  const known = mentionableSkills(profile);
  const extra = parsed.skills.filter((s) => !known.has(s));
  if (extra.length) out.push(`The resume mentions ${extra.join(", ")}, which the profile does not list. Add them to the profile if you want them used.`);

  const inResume = new Set(parsed.skills);
  const unsupported = profile.skills
    .flatMap((g) => g.items)
    .filter((item) => {
      const canonical = extractSkills(item);
      return canonical.length ? !canonical.some((c) => inResume.has(c)) : !lower.includes(item.toLowerCase());
    });
  if (unsupported.length) out.push(`The profile lists ${unsupported.join(", ")}, which the resume file does not mention. Remove them unless they are genuinely your skills.`);
  for (const e of profile.experience) {
    if (!lower.includes(e.company.toLowerCase())) out.push(`The profile lists experience at ${e.company}, which the resume file does not mention.`);
  }
  return out;
}

export const resumeDir = () => path.join(env.dataDir, "resume");

/** Where the original resume lives: the profile's recorded file, or the one placed by `npm run setup`. */
export function originalResumePath(profile: Profile): string | null {
  const candidates = [profile.resumeFile, path.join(resumeDir(), "original.pdf")].filter((p): p is string => Boolean(p));
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** Store an uploaded resume under a new, timestamped name. Earlier uploads are kept. */
export async function storeResume(data: Uint8Array): Promise<string> {
  await mkdir(resumeDir(), { recursive: true });
  const file = path.join(resumeDir(), `resume-${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`);
  await writeFile(file, data, { flag: "wx" });
  return file;
}
