import { downloadJobFile } from "@/controllers/jobController";
import { route } from "@/middlewares/apiHandler";

export const GET = route(downloadJobFile);
