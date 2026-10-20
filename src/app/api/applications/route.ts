import { getApplications } from "@/controllers/applicationController";
import { route } from "@/middlewares/apiHandler";

export const GET = route(getApplications);
