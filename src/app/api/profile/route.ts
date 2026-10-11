import { readFile } from "node:fs/promises";
import { readJson, route } from "@/server/api";
import { rescoreAll } from "@/server/matching/match";
import { experienceSummary, getProfile, saveProfile } from "@/server/profile/profile";
import { compareResume, originalResumePath, parseResumePdf } from "@/server/profile/resume";
import { ProfileInput } from "@/server/validation";
import type { Profile } from "@/shared/types";

async function payload(profile: Profile) {
  const file = originalResumePath(profile);
  let differences: string[] | null = null;
  if (file) differences = compareResume(await parseResumePdf(await readFile(file)), profile);
  return { profile: { ...profile, resumeFile: undefined }, experience: experienceSummary(profile), hasResume: Boolean(file), differences };
}

export const GET = route(async () => payload(await getProfile()));

export const PUT = route(async (req) => {
  const input = await readJson(req, ProfileInput);
  const current = await getProfile();
  const saved = await saveProfile({ ...input, resumeFile: current.resumeFile });
  // Skills and experience drive every score.
  const rescored = await rescoreAll();
  return { ...(await payload(saved)), rescored };
});
