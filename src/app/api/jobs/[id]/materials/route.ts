import { readJson, route } from "@/server/api";
import { updateMaterials } from "@/server/documents/prepare";
import { MaterialsInput } from "@/server/validation";

export const PUT = route<{ id: string }>(async (req, { id }) => {
  const app = await updateMaterials(id, await readJson(req, MaterialsInput));
  return { resumeVersion: app.resumeVersion, truthWarnings: app.truthWarnings };
});
