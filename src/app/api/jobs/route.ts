import { createJob, getJobs } from "@/controllers/jobController";
import { route } from "@/middlewares/apiHandler";

export const GET = route(getJobs);
export const POST = route(createJob);
