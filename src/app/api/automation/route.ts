import { setAutomationPaused } from "@/controllers/automationController";
import { route } from "@/middlewares/apiHandler";

export const POST = route(setAutomationPaused);
