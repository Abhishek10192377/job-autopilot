import { readFile } from "node:fs/promises";
import { ApiError, rateLimit, route } from "@/server/api";
import { getProfile, saveProfile } from "@/server/profile/profile";
import { compareResume, originalResumePath, parseResumePdf, storeResume } from "@/server/profile/resume";

const MAX_BYTES = 5 * 1024 * 1024;

/** Download the original resume, exactly as uploaded. */
export const GET = route(async () => {
  const file = originalResumePath(await getProfile());
  if (!file) throw new ApiError(404, "No resume file has been stored yet.");
  return new Response(new Uint8Array(await readFile(file)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="original-resume.pdf"', "Cache-Control": "no-store" } });
});

/** Upload a new original resume. It is stored alongside earlier ones; the profile itself is only changed by you. */
export const POST = route(async (req) => {
  rateLimit("resume-upload", 10, 60_000);
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Attach a PDF file.");
  if (file.size > MAX_BYTES) throw new ApiError(413, "The file is larger than 5 MB.");
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
});
