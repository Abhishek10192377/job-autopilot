import { getDashboard } from "@/controllers/dashboardController";
import { route } from "@/middlewares/apiHandler";

export const GET = route(getDashboard);
