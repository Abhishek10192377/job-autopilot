import { readFile } from "node:fs/promises";
import path from "node:path";
import { ApiError, route } from "@/server/api";
import { Application } from "@/server/db/models";
import { renderLetterPdf } from "@/server/documents/render";
import { getProfile } from "@/server/profile/profile";

const TYPES = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

function download(data: Uint8Array, name: string, type: string) {
  return new Response(new Uint8Array(data), { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}

// ?doc=resume&format=pdf|docx[&version=N]  or  ?doc=letter
export const GET = route<{ id: string }>(async (req, { id }) => {
  const q = req.nextUrl.searchParams;
  const app = await Application.findOne({ jobId: id }).lean();
  if (!app?.materials) throw new ApiError(404, "No prepared materials for this job.");
  if (q.get("doc") === "letter") {
    const profile = await getProfile();
    return download(await renderLetterPdf(profile, app.materials.coverLetter), `${profile.name.replace(/[^a-z0-9]+/gi, "_")}_Cover_Letter.pdf`, TYPES.pdf);
  }
  const format = q.get("format") === "docx" ? "docx" : "pdf";
  const version = Number(q.get("version")) || app.resumeVersion;
  const entry = app.resumeFiles.find((f) => f.version === version);
  if (!entry) throw new ApiError(404, `Resume version ${version} not found.`);
  try {
    return download(await readFile(entry[format]), path.basename(entry[format]), TYPES[format]);
  } catch {
    throw new ApiError(404, "The saved file is missing from data/private — prepare the application again.");
  }
});
