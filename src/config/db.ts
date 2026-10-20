import mongoose from "mongoose";
import { env } from "./env";

const cached = globalThis as typeof globalThis & {
  mongoose?: Promise<typeof mongoose>;
};

export async function connectDb() {
  if (!cached.mongoose) {
    cached.mongoose = mongoose
      .connect(env.mongoUri)
      .catch((error) => {
        cached.mongoose = undefined;
        throw error;
      });
  }
  return cached.mongoose;
}

export async function disconnectDb() {
  if (cached.mongoose) {
    await mongoose.disconnect();
    cached.mongoose = undefined;
  }
}
