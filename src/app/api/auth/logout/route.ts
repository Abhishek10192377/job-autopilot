import { logout } from "@/controllers/authController";

// No database needed, so this one skips the route() wrapper.
export const POST = logout;
