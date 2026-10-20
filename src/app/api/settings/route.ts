import { getSettingsData, updateSettings } from "@/controllers/settingsController";
import { route } from "@/middlewares/apiHandler";

export const GET = route(getSettingsData);
export const PUT = route(updateSettings);
