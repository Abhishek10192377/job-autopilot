import { getJob, updateJobStatus } from "@/controllers/jobController";
import { route } from "@/middlewares/apiHandler";

export const GET = route(getJob);
export const PATCH = route(updateJobStatus);
