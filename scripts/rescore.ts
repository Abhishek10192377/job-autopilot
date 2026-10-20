// Re-score every stored job against the current profile and settings: `npm run rescore`.
import "../src/config/loadEnv";
import { connectDb, disconnectDb } from "../src/config/db";
import { Job } from "../src/models";
import { rescoreAll } from "../src/services/matching/match";

connectDb()
  .then(async () => {
    const count = await rescoreAll();
    console.log(`Re-scored ${count} jobs; ${await Job.countDocuments({ status: "matched" })} are currently matched.`);
    await disconnectDb();
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
