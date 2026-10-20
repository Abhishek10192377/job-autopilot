import { login } from "@/controllers/authController";
import { route } from "@/middlewares/apiHandler";

export const POST = route(login);
