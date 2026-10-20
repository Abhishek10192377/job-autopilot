// Check the MongoDB connection without printing credentials: `npm run check-db`.
import "../src/config/loadEnv";
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "../src/config/db";
import { env } from "../src/config/env";

console.log(`Connecting to ${env.mongoUri.replace(/\/\/[^@]*@/, "//***@").split("?")[0] || "(MONGODB_URI is empty)"}`);

connectDb()
  .then(async () => {
    const collections = await mongoose.connection.db!.listCollections().toArray();
    console.log(`Connected to database "${mongoose.connection.name}".`);
    console.log(`Collections: ${collections.map((c) => c.name).join(", ") || "(none yet)"}`);
    await disconnectDb();
  })
  .catch((e) => {
    console.error(`Connection failed: ${e.message}`);
    process.exit(1);
  });
