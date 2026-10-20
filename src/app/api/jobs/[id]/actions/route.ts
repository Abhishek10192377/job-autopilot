import { runJobAction } from "@/controllers/jobController";
import { route } from "@/middlewares/apiHandler";

export const POST = route(runJobAction);
