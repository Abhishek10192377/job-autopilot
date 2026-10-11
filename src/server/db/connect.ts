import mongoose from "mongoose";
import { env } from "../config/env";

const g = globalThis as unknown as { __mongoose?: Promise<typeof mongoose> };

/** One shared connection per process (survives Next.js hot reloads). */
export function connectDb(): Promise<typeof mongoose> {
  if (!g.__mongoose) {
    g.__mongoose = mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 }).catch((e) => {
      g.__mongoose = undefined;
      throw new Error(
        `Cannot reach MongoDB at ${env.mongoUri.replace(/\/\/[^@/]+@/, "//***@")} — start it with "npm run db". (${e.message})`,
      );
    });
  }
  return g.__mongoose;
}

export async function disconnectDb() {
  if (g.__mongoose) {
    await mongoose.disconnect();
    g.__mongoose = undefined;
  }
}
