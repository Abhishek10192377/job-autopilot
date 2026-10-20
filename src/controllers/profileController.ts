import { readFile } from "node:fs/promises";
import type { NextRequest } from "next/server";
import { ApiError, rateLimit, readJson } from "@/middlewares/apiHandler";
import { rescoreAll } from "@/services/matching/match";
import { experienceSummary, getProfile, saveProfile } from "@/services/profile/profile";
import { compareResume, originalResumePath, parseResumePdf, storeResume } from "@/services/profile/resume";
import type { Profile } from "@/types";
import { ProfileInput } from "@/validators";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

async function payload(profile: Profile) {
  const file = originalResumePath(profile);
  let differences: string[] | null = null;
  if (file) differences = compareResume(await parseResumePdf(await readFile(file)), profile);
  return { profile: { ...profile, resumeFile: undefined }, experience: experienceSummary(profile), hasResume: Boolean(file), differences };
}

/** GET /api/profile */
export async function getProfileData() {
  return payload(await getProfile());
}

/** PUT /api/profile */
export async function updateProfile(req: NextRequest) {
  const input = await readJson(req, ProfileInput);
  const current = await getProfile();
  const saved = await saveProfile({ ...input, resumeFile: current.resumeFile });
  // Skills and experience drive every score.
  const rescored = await rescoreAll();
  return { ...(await payload(saved)), rescored };
}

/** GET /api/profile/resume: download the original resume, exactly as uploaded. */
export async function downloadResume() {
  const file = originalResumePath(await getProfile());
  if (!file) throw new ApiError(404, "No resume file has been stored yet.");
  return new Response(new Uint8Array(await readFile(file)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="original-resume.pdf"', "Cache-Control": "no-store" } });
}

/** POST /api/profile/resume: upload a new original resume. It is stored alongside earlier ones; the profile itself is only changed by you. */
export async function uploadResume(req: NextRequest) {
  rateLimit("resume-upload", 10, 60_000);
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Attach a PDF file.");
  if (file.size > MAX_RESUME_BYTES) throw new ApiError(413, "The file is larger than 5 MB.");
  const data = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(data.slice(0, 5)) !== "%PDF-") throw new ApiError(400, "That file is not a PDF.");
  let parsed;
  try {
    parsed = await parseResumePdf(data);
  } catch {
    throw new ApiError(400, "The PDF could not be read.");
  }
  if (parsed.text.trim().length < 200) throw new ApiError(400, "No text could be extracted — the PDF looks like a scanned image. Export it from your editor as a text PDF.");
  const profile = await getProfile();
  await saveProfile({ ...profile, resumeFile: await storeResume(data) });
  return { pages: parsed.pages, skills: parsed.skills, differences: compareResume(parsed, profile) };
}
