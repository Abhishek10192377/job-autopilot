import { runDiscovery } from "@/controllers/automationController";
import { route } from "@/middlewares/apiHandler";

export const POST = route(runDiscovery);
