// Imported first by the worker and CLI scripts. Next.js loads .env.local itself.
import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"], quiet: true });
