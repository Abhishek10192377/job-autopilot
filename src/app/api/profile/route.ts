import { getProfileData, updateProfile } from "@/controllers/profileController";
import { route } from "@/middlewares/apiHandler";

export const GET = route(getProfileData);
export const PUT = route(updateProfile);
