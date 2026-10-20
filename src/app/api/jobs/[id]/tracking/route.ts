import { updateJobTracking } from "@/controllers/jobController";
import { route } from "@/middlewares/apiHandler";

export const PATCH = route(updateJobTracking);
