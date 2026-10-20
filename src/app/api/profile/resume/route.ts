import { downloadResume, uploadResume } from "@/controllers/profileController";
import { route } from "@/middlewares/apiHandler";

export const GET = route(downloadResume);
export const POST = route(uploadResume);
