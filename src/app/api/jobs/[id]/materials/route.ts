import { updateJobMaterials } from "@/controllers/jobController";
import { route } from "@/middlewares/apiHandler";

export const PUT = route(updateJobMaterials);
